// Helper: extract minimal chat messages from YouTube API response
function extractMinimalChatMessages(data: any, maxMessages = 50) {
    const actions = data?.continuationContents?.liveChatContinuation?.actions || [];
    const recent = actions.slice(-maxMessages);
    const messages = recent.map((action: any) => {
        const item = action.addChatItemAction?.item?.liveChatTextMessageRenderer;
        if (!item) return null;
        const runs = item.message?.runs || [];
        let msg = '';
        let emotes = [];
        let currIdx = 0;
        for (const r of runs) {
            if (r.text) {
                msg += r.text;
                currIdx += r.text.length;
            } else if (r.emoji && r.emoji.shortcuts && r.emoji.shortcuts.length > 0 && r.emoji.image?.thumbnails?.length > 0) {
                const shortcut = r.emoji.shortcuts[0];
                const url = r.emoji.image.thumbnails[r.emoji.image.thumbnails.length - 1].url;
                const start = currIdx;
                msg += shortcut;
                const end = currIdx + shortcut.length - 1;
                emotes.push({
                    name: shortcut,
                    url,
                    positions: [[start, end]],
                    platform: 'youtube',
                });
                currIdx += shortcut.length;
            }
        }
        if (msg.length > 300) msg = msg.slice(0, 300) + '…';
        // Convert timestampUsec (string) to ms since epoch (number)
        let timestamp = undefined;
        if (item.timestampUsec) {
            timestamp = Math.floor(Number(item.timestampUsec) / 1000);
        }
        return {
            id: `youtube-${item.id}`,
            platform: 'youtube',
            username: item.authorName?.simpleText || 'YouTube User',
            message: msg,
            timestamp: timestamp || Date.now(),
            emotes,
            // Optionally: userColor: undefined
        };
    }).filter(Boolean);
    return messages;
}
import type { RequestHandler } from '@sveltejs/kit';

// Helper: fetch with browser-like headers (no timeout)
async function fetchWithTimeout(resource: string, options: any = {}) {
    // Set browser-like headers (more complete)
    // Generate random number for CONSENT cookie
    const rand = Math.floor(Math.random() * (999 - 100 + 1)) + 100;
    const consentValue = `YES+yt.432048971.it+FX+${rand}`;
    const browserHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.youtube.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cookie': `PREF=tz=Europe.Rome; CONSENT=${consentValue}`
    };
    // Always use our browser-like headers, but allow explicit overrides in options.headers
    const headers = { ...browserHeaders, ...(options.headers || {}) };
    const response = await fetch(resource, { ...options, headers });
    return response;
}

// POST /api/youtube-chat
// { channelName: string, continuation?: string, videoId?: string }c
export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { channelName, continuation, videoId } = body;
        let vid = videoId;
        let cont = continuation;
        let apiKey = '';
        let clientVersion = '';
        let clientName = '';
        let emoteMap: Record<string, string> = {};
        // Step 1: If no videoId, get it from channelName
        if (!vid) {
            const url = `https://www.youtube.com/@${encodeURIComponent(channelName)}/live`;
            const res = await fetchWithTimeout(url, {});
            const text = await res.text();
            const videoIdMatch = text.match(/"videoId":"([^"]+)"/);
            if (!videoIdMatch || !videoIdMatch[1]) {
                // Always return a consistent structure on error
                return new Response(JSON.stringify({ messages: [], videoId: null, continuation: null, error: 'Could not find live video for this channel.' }), { status: 200 });
            }
            vid = videoIdMatch[1];
        }
        // Step 2: If no continuation, get it from the main video page (ytInitialData)
        if (!cont) {
            const url = `https://www.youtube.com/watch?v=${vid}`;
            const res = await fetchWithTimeout(url, {});
            const text = await res.text();
            // Extract ytInitialData JSON
            const initialDataMatch = text.match(/var ytInitialData = (\{.*?\});<\/script>/s);
            let initialData = null;
            if (initialDataMatch && initialDataMatch[1]) {
                try {
                    initialData = JSON.parse(initialDataMatch[1]);
                } catch (e) {}
            }
            if (!initialData) {
                // Try alternate pattern (sometimes in window["ytInitialData"])
                const altMatch = text.match(/window\["ytInitialData"\] = (\{.*?\});/s);
                if (altMatch && altMatch[1]) {
                    try {
                        initialData = JSON.parse(altMatch[1]);
                    } catch (e) {}
                }
            }
            if (!initialData) {
                return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: null, error: 'Could not find ytInitialData JSON.' }), { status: 200 });
            }
            // Find the live chat continuation token in initialData
            let continuation = null;
            try {
                // Path: initialData.contents.twoColumnWatchNextResults.conversationBar.liveChatRenderer.continuations[0].reloadContinuationData.continuation
                const contArr = initialData.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer?.continuations;
                if (contArr && contArr.length > 0) {
                    const reload = contArr[0].reloadContinuationData;
                    if (reload && reload.continuation) {
                        continuation = reload.continuation;
                    }
                }
            } catch (e) {}
            if (!continuation) {
                // Try to find any continuation in the JSON
                const jsonStr = JSON.stringify(initialData);
                const contMatch = jsonStr.match(/\"continuation\"\s*:\s*\"([^\"]+)\"/);
                if (contMatch && contMatch[1]) {
                    continuation = contMatch[1];
                }
            }
            if (!continuation) {
                // Log the first 1000 characters of the fetched HTML for debugging
                console.error('[YouTube Chat Debug] Could not find live chat continuation token. Fetched HTML (first 1000 chars):', text.slice(0, 1000));
                return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: null, error: 'Could not find live chat continuation token in ytInitialData.' }), { status: 200 });
            }
            cont = continuation;
            // Extract INNERTUBE_API_KEY and client info from the HTML
            let apiKeyMatch = text.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
            if (!apiKeyMatch) {
                // Try alternate pattern (sometimes single quotes or escaped)
                apiKeyMatch = text.match(/INNERTUBE_API_KEY['\"]?\s*[:=]\s*['\"]([^'\"]+)['\"]/);
            }
            apiKey = apiKeyMatch ? apiKeyMatch[1] : '';
            const clientVersionMatch = text.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
            const clientNameMatch = text.match(/"INNERTUBE_CLIENT_NAME":(\d+)/);
            clientVersion = clientVersionMatch ? clientVersionMatch[1] : '1.20230510.01.00';
            clientName = clientNameMatch ? clientNameMatch[1] : '1';
            if (!apiKey) {
                return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: cont, error: 'Could not find YouTube INNERTUBE_API_KEY.' }), { status: 200 });
            }
            // --- Fetch emotes from chat popout page ---
            try {
                const chatUrl = `https://www.youtube.com/live_chat?v=${vid}`;
                const chatRes = await fetchWithTimeout(chatUrl, {});
                const chatText = await chatRes.text();
                // Extract window["ytInitialData"] JSON from <script> tag
                const chatInitMatch = chatText.match(/window\["ytInitialData"\] = (\{.*?\});/s);
                if (chatInitMatch && chatInitMatch[1]) {
                    try {
                        const chatInitData = JSON.parse(chatInitMatch[1]);
                        const emojis = chatInitData?.contents?.liveChatRenderer?.emojis;
                        if (Array.isArray(emojis)) {
                            // Build emote map: { ":emote_name:": url }
                            emoteMap = {};
                            for (const emoji of emojis) {
                                if (emoji.shortcuts && emoji.shortcuts.length > 0 && emoji.image?.thumbnails?.length > 0) {
                                    const shortcut = emoji.shortcuts[0];
                                    const url = emoji.image.thumbnails[emoji.image.thumbnails.length - 1].url;
                                    emoteMap[shortcut] = url;
                                }
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        // Step 3: If continuation and videoId are present, poll chat endpoint
        if (cont && vid) {
            // If we don't have apiKey/client info yet, fetch them
            if (!apiKey) {
                const url = `https://www.youtube.com/live_chat?v=${vid}`;
                const res = await fetchWithTimeout(url, {});
                const text = await res.text();
                const apiKeyMatch = text.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
                const clientVersionMatch = text.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
                const clientNameMatch = text.match(/"INNERTUBE_CLIENT_NAME":(\d+)/);
                apiKey = apiKeyMatch ? apiKeyMatch[1] : '';
                clientVersion = clientVersionMatch ? clientVersionMatch[1] : '1.20230510.01.00';
                clientName = clientNameMatch ? clientNameMatch[1] : '1';
                if (!apiKey) {
                    return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: cont, error: 'Could not find YouTube INNERTUBE_API_KEY.' }), { status: 200 });
                }
            }
            const url = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`;
            const body = {
                context: {
                    client: {
                        clientName,
                        clientVersion
                    }
                },
                continuation: cont
            };
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'x-youtube-client-name': clientName,
                    'x-youtube-client-version': clientVersion
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: cont, error: `YouTube chat fetch failed: ${res.status}` }), { status: 200 });
            }
            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: cont, error: 'Invalid JSON from YouTube chat endpoint.' }), { status: 200 });
            }
            if (!data || !data.continuationContents) {
                return new Response(JSON.stringify({ messages: [], videoId: vid, continuation: cont, error: 'No chat data returned from YouTube.' }), { status: 200 });
            }
            // Only return minimal chat messages and continuation
            const messages = extractMinimalChatMessages(data, 50);
            // Return emoteMap as well for frontend use
            return new Response(JSON.stringify({ messages, videoId: vid, continuation: cont, emoteMap }), { status: 200 });
        }
        return new Response(JSON.stringify({ messages: [], videoId: vid || null, continuation: cont || null, error: 'Missing required parameters.' }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ messages: [], videoId: null, continuation: null, error: err instanceof Error ? err.message : String(err) }), { status: 200 });
    }
};

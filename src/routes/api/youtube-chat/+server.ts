import { Innertube } from 'youtubei.js';
import type { RequestHandler } from '@sveltejs/kit';


function extractMinimalChatMessages(chatData: any, maxMessages = 50, emoteMap?: Record<string, string>, emoteNameMap?: Record<string, string>, emojiList?: any[]) {
    if (!chatData || !chatData.actions) return [];

    const messages = [];
    let count = 0;

    for (const action of chatData.actions) {
        if (count >= maxMessages) break;

        // Support both YouTube.js v4+ and legacy/alternate structures
        if (action.addChatItemAction && action.addChatItemAction.item) {
            // YouTube.js v4+ structure
            const messageData = extractMessageFromChatItem(action.addChatItemAction.item, emoteMap, emoteNameMap, emojiList);
            if (messageData) {
                messages.push(messageData);
                count++;
            }
        } else if (action.type === 'AddChatItemAction' && action.item) {
            // Legacy/alternate structure (as seen in your logs)
            const messageData = extractMessageFromChatItem(action.item, emoteMap, emoteNameMap, emojiList);
            if (messageData) {
                messages.push(messageData);
                count++;
            }
        }
    }

    return messages;


function extractMessageFromChatItem(item: any, emoteMap?: Record<string, string>, emoteNameMap?: Record<string, string>, emojiList?: any[]) {
    // Support both renderer and new YouTube.js types
    if (item.type === 'liveChatTextMessageRenderer' || item.type === 'LiveChatTextMessage') {
        return extractTextMessage(item, emoteMap, emoteNameMap, emojiList);
    } else if (item.type === 'liveChatPaidMessageRenderer' || item.type === 'LiveChatPaidMessage') {
        return extractPaidMessage(item, emoteMap, emoteNameMap, emojiList);
    } else if (item.type === 'liveChatMembershipItemRenderer' || item.type === 'LiveChatMembershipItem') {
        return extractMembershipMessage(item, emoteMap, emoteNameMap, emojiList);
    }
    return null;
}
}

function extractTextMessage(renderer: any, emoteMap?: Record<string, string>, emoteNameMap?: Record<string, string>, emojiList?: any[]) {
    let msg = '';
    let emotes = [];
    let currIdx = 0;
    let authorName = 'YouTube User';
    let authorBadges = [];

    // Extract author information (support both renderer and new YouTube.js types)
    if (renderer.authorName) {
        authorName = renderer.authorName.simpleText || 'YouTube User';
    } else if (renderer.author && renderer.author.name) {
        authorName = renderer.author.name;
    }

    // Extract badges
    if (renderer.authorBadges) {
        authorBadges = renderer.authorBadges.map((badge: any) => ({
            name: badge.liveChatAuthorBadgeRenderer?.customThumbnail?.simpleText ||
                badge.liveChatAuthorBadgeRenderer?.icon?.iconType || '',
            url: badge.liveChatAuthorBadgeRenderer?.customThumbnail?.thumbnails?.[0]?.url ||
                badge.liveChatAuthorBadgeRenderer?.icon?.thumbnails?.[0]?.url || '',
            description: badge.liveChatAuthorBadgeRenderer?.tooltip || ''
        }));
    }

    // Process message runs (text and emojis)
    if (renderer.message && renderer.message.runs) {
        for (const run of renderer.message.runs) {
            if (run.text) {
                msg += run.text;
                currIdx += run.text.length;
            } else if (run.emoji) {
                const emoji = run.emoji;
                // DEBUG: Log the emoji structure for troubleshooting
                if (emoji.emojiId && emoji.emojiId.startsWith('youtube/')) {
                    console.log('DEBUG: YouTube emoji run:', JSON.stringify(emoji, null, 2));
                }
                // Always prefer image from run.emoji.image.thumbnails (prefer last/large)
                let url = '';
                if (emoji.image && Array.isArray(emoji.image.thumbnails) && emoji.image.thumbnails.length > 0) {
                    url = emoji.image.thumbnails[emoji.image.thumbnails.length - 1].url;
                } else if (emoji.image && emoji.image.url) {
                    url = emoji.image.url;
                }
                // Prefer shortcut, fallback to unicode, fallback to emojiId, but always show as :emote_name:
                let emoteName = '';
                if (emoji.shortcuts && emoji.shortcuts.length > 0) {
                    emoteName = emoji.shortcuts[0];
                } else if (emoji.alt) {
                    emoteName = emoji.alt;
                } else if (emoji.unicode) {
                    emoteName = emoji.unicode;
                } else if (emoji.emojiId) {
                    emoteName = emoji.emojiId
                } else {
                    emoteName = 'emoji';
                }
                // Fallback: try to get image from emoteMap if url is still empty
                if (!url && emoteMap) {
                    if (emoteName && emoteMap[emoteName]) {
                        url = emoteMap[emoteName];
                    } else if (emoji.emojiId && emoteMap[emoji.emojiId]) {
                        url = emoteMap[emoji.emojiId];
                    } else if (emoji.emojiId) {
                        // Try last segment of emojiId as a fallback key
                        const parts = emoji.emojiId.split('/');
                        if (parts.length > 1 && emoteMap[parts[parts.length - 1]]) {
                            url = emoteMap[parts[parts.length - 1]];
                        }
                    }
                }
                if (url) {
                    const imgTag = `<img src=\"${url}\" alt=\":${emoteName}:\" class=\"yt-emote\" style=\"height:1em;vertical-align:-0.2em;\" />`;
                    msg += imgTag;
                    const start = currIdx;
                    const end = currIdx + 1;
                    emotes.push({
                        name: emoteName,
                        url,
                        positions: [[start, end]],
                        platform: 'youtube',
                    });
                    currIdx += 1;
                } else {
                    // Always show as :emote_name:
                    msg += `:${emoteName}:`;
                    currIdx += emoteName.length + 2;
                }
            }
        }
    }

    // Post-process: replace YouTube emoteId patterns in msg with :emote_name: using emojiId for global emotes
    msg = msg.replace(/UC[\w-]{21}[AQgw]\/[A-Za-z0-9_-]+|face-[a-z-]+/g, (match) => {
        let name = '';
        // Try direct emojiId match in emojiList
        if (emojiList && Array.isArray(emojiList)) {
            let emojiObj = emojiList.find(e => e.emojiId === match);
            if (!emojiObj) {
                // Try last segment for channel emotes
                const emoteKey = match.split('/').pop();
                emojiObj = emojiList.find(e => e.emojiId === emoteKey);
            }
            if (emojiObj) {
                if (emojiObj.shortcuts && emojiObj.shortcuts.length > 0) {
                    name = emojiObj.shortcuts[0];
                } else if (emojiObj.alt) {
                    name = emojiObj.alt;
                } else if (emojiObj.unicode) {
                    name = emojiObj.unicode;
                } else if (emojiObj.emojiId) {
                    name = emojiObj.emojiId.replace(/^.*\//, '');
                }
            }
        }
        // Fallback to emoteNameMap if available
        if (!name && emoteNameMap) {
            if (emoteNameMap[match]) {
                name = emoteNameMap[match];
            } else {
                const emoteKey = match.split('/').pop();
                if (emoteKey && emoteNameMap[emoteKey]) {
                    name = emoteNameMap[emoteKey];
                }
            }
        }
        if (!name) {
            name = match.replace(/^.*\//, '');
        }
        name = name.replace(/^:+|:+$/g, '');
        return `:${name}:`;
    });

    // Truncate long messages
    if (msg.length > 300) msg = msg.slice(0, 300) + '…';

    // Convert timestamp
    let timestamp = Date.now();
    if (renderer.timestampUsec) {
        timestamp = Math.floor(parseInt(renderer.timestampUsec) / 1000); // Convert microseconds to milliseconds (ms)
    } else if (renderer.timestampText) {
        // Try to parse timestamp text if available
        timestamp = Date.now();
    }

    return {
        id: `youtube-${renderer.id || Math.random().toString(36).substr(2, 9)}`,
        platform: 'youtube',
        username: authorName,
        message: msg,
        timestamp,
        emotes,
        badges: authorBadges,
        userColor: renderer.authorName?.color || undefined,
        eventType: renderer.eventType || undefined
    };
}

function extractPaidMessage(renderer: any, emoteMap?: Record<string, string>, emoteNameMap?: Record<string, string>, emojiList?: any[]) {
    const textMessage = extractTextMessage(renderer, emoteMap, emoteNameMap, emojiList);
    if (textMessage) {
        textMessage.eventType = 'superchat';
        // Add paid message specific properties
        if (renderer.purchaseAmountText) {
            textMessage.message = `💰 ${renderer.purchaseAmountText.simpleText} - ${textMessage.message}`;
        }
    }
    return textMessage;
}

function extractMembershipMessage(renderer: any, emoteMap?: Record<string, string>, emoteNameMap?: Record<string, string>, emojiList?: any[]) {
    const textMessage = extractTextMessage(renderer, emoteMap, emoteNameMap, emojiList);
    if (textMessage) {
        textMessage.eventType = 'membership';
        textMessage.message = `🎗️ ${textMessage.username} became a member!`;
    }
    return textMessage;
}

// Cache for Innertube instances and live chat instances
const youtubeInstances = new Map<string, any>();
const liveChatInstances = new Map<string, any>();

async function getYouTubeInstance(sessionId = 'default') {
    if (!youtubeInstances.has(sessionId)) {
        try {
            const youtube = await Innertube.create({
                visitor_data: undefined,
                enable_session_cache: false,
            });
            youtubeInstances.set(sessionId, youtube);
        } catch (error) {
            console.error('Failed to create YouTube.js instance:', error);
            throw error;
        }
    }
    return youtubeInstances.get(sessionId);
}

async function getLiveChatInstance(youtube: any, videoId: string) {
    const cacheKey = `livechat-${videoId}`;

    if (!liveChatInstances.has(cacheKey)) {
        try {
            const videoInfo = await youtube.getInfo(videoId);

            if (!videoInfo) {
                throw new Error('Could not get video information');
            }

            if (!videoInfo.livechat) {
                console.error('videoInfo.livechat is missing. videoInfo:', JSON.stringify(videoInfo, null, 2));
                throw new Error('This video does not have live chat enabled or is not currently live');
            }

            // Instead of caching the livechat object, cache the video info
            // The livechat property should have the initial continuation
            liveChatInstances.set(cacheKey, videoInfo);
        } catch (error) {
            console.error('Failed to get video info:', error);
            throw error;
        }
    }

    return liveChatInstances.get(cacheKey);
}

// POST /api/youtube-chat
// { channelName: string, continuation?: string, videoId?: string }
export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { channelName, continuation, videoId } = body;
        let vid = videoId;
        let cont = continuation;
        let liveChatInstance: any = null;
        let emoteMap: Record<string, string> = {};
        let emoteNameMap: Record<string, string> = {};

        const youtube = await getYouTubeInstance();

        // Step 1: If no videoId, get it from channelName (handle, URL, or channel ID)
        if (!vid) {
            try {
                let channelId = channelName;
                let resolvedChannel = null;
                let endpoint = null;

                // If input is not a channel ID, try to resolve it
                if (!/^UC[\w-]{21}[AQgw]$/.test(channelName)) {
                    // Use resolveURL for @handle or any youtube.com URL
                    if (channelName.startsWith('@') || channelName.includes('youtube.com/')) {
                        try {
                            endpoint = await youtube.resolveURL(channelName);
                            if (endpoint && endpoint.payload && endpoint.payload.browseId) {
                                channelId = endpoint.payload.browseId;
                            } else {
                                // Check for malformed/unknown URLs (e.g., http://box2_/)
                                const url = endpoint?.payload?.url;
                                if (url && (!url.startsWith('https://www.youtube.com/') && !url.startsWith('https://youtube.com/'))) {
                                    // Silently treat as failed resolution, fall back to search
                                    // No need to log confusing endpoint
                                } else {
                                    // Log only if it's a real YouTube URL but missing browseId
                                    console.warn('resolveURL did not return a valid channel endpoint for input:', channelName, 'endpoint:', endpoint);
                                }
                                const search = await youtube.search(channelName, { type: 'channel' });
                                if (search.results && search.results.length > 0) {
                                    channelId = search.results[0].id;
                                } else {
                                    throw new Error(`Could not resolve channel: ${channelName}. This does not appear to be a valid YouTube handle or URL, and search returned no results. Please double-check the handle or try a different input (e.g., channel name, @handle, or full URL).`);
                                }
                            }
                        } catch (resolveError) {
                            // Fallback to search if resolveURL throws
                            console.warn('resolveURL threw error, falling back to search:', resolveError);
                            const search = await youtube.search(channelName, { type: 'channel' });
                            if (search.results && search.results.length > 0) {
                                channelId = search.results[0].id;
                            } else {
                                throw new Error(`Could not resolve channel: ${channelName}. resolveURL failed and search returned no results.`);
                            }
                        }
                    } else {
                        // Try to search for channel by name
                        console.log(`Searching for channel: ${channelName}`);
                        const search = await youtube.search(channelName, { type: 'channel' });
                        if (!search.results || search.results.length === 0) {
                            return new Response(JSON.stringify({
                                messages: [],
                                videoId: null,
                                continuation: null,
                                error: `Could not find channel: ${channelName}. Please check the channel name or try using @username format.`
                            }), { status: 200 });
                        }
                        channelId = search.results[0].id;
                    }
                }

                // Get channel if not already resolved
                if (!resolvedChannel) {
                    try {
                        resolvedChannel = await youtube.getChannel(channelId);
                    } catch (channelError) {
                        if (channelError && typeof (channelError as any).message === 'string' && (channelError as any).message.includes('CompositeVideoPrimaryInfo')) {
                            return new Response(JSON.stringify({
                                messages: [],
                                videoId: null,
                                continuation: null,
                                error: `YouTube internal API has changed and the parser is out of date. Please update the youtubei.js library to the latest version. (Parser error: CompositeVideoPrimaryInfo not found)`
                            }), { status: 200 });
                        }
                        throw channelError;
                    }
                }

                let liveVideo = null;

                // Method 1: Try getLiveStreams() first
                try {
                    const live_streams = await resolvedChannel.getLiveStreams();
                    if (live_streams.videos && live_streams.videos.length > 0) {
                        liveVideo = live_streams.videos[0];
                    }
                } catch (streamError) {
                    console.warn('getLiveStreams() failed, trying alternative methods:', streamError);
                }

                // Method 2: Search for live videos if getLiveStreams() failed
                if (!liveVideo) {
                    try {
                        console.log('Searching for live videos...');
                        const search = await youtube.search(`${resolvedChannel.name || channelName} live`, {
                            type: 'video',
                            features: ['live']
                        });

                        if (search.results && search.results.length > 0) {
                            // Filter results to only include videos from this channel
                            const channelLiveVideos = search.results.filter((video: any) =>
                                video.author?.id === channelId ||
                                video.author?.name === resolvedChannel.name ||
                                video.author?.name === channelName.replace('@', '')
                            );

                            if (channelLiveVideos.length > 0) {
                                liveVideo = channelLiveVideos[0];
                                console.log(`Found live stream via search: ${liveVideo.id}`);
                            }
                        }
                    } catch (searchError) {
                        console.warn('Live video search failed:', searchError);
                    }
                }

                // Method 3: Try getting recent videos and check if any are live
                if (!liveVideo) {
                    try {
                        console.log('Checking recent videos for live streams...');
                        const videos = await resolvedChannel.getVideos();
                        if (videos.videos && videos.videos.length > 0) {
                            // Check the first few videos to see if any are live
                            for (const video of videos.videos.slice(0, 5)) {
                                try {
                                    const videoInfo = await youtube.getInfo(video.id);
                                    if (videoInfo.basic_info?.is_live) {
                                        liveVideo = video;
                                        console.log(`Found live stream in recent videos: ${liveVideo.id}`);
                                        break;
                                    }
                                } catch (videoError) {
                                    // Continue to next video
                                    continue;
                                }
                            }
                        }
                    } catch (videosError) {
                        console.warn('getVideos() failed:', videosError);
                    }
                }

                // Method 4: Try upcoming streams as fallback
                if (!liveVideo) {
                    try {
                        console.log('Checking upcoming streams...');
                        const upcoming = await resolvedChannel.getUpcoming();

                        if (upcoming.videos && upcoming.videos.length > 0) {
                            // Check if any upcoming stream is actually live
                            const upcomingLive = upcoming.videos.find((video: any) => video.is_live);
                            if (upcomingLive) {
                                liveVideo = upcomingLive;
                                console.log(`Found live stream in upcoming: ${liveVideo.id}`);
                            }
                        }
                    } catch (upcomingError) {
                        console.warn('getUpcoming() failed:', upcomingError);
                    }
                }

                if (!liveVideo) {
                    return new Response(JSON.stringify({
                        messages: [],
                        videoId: null,
                        continuation: null,
                        error: `No live streams found for channel: ${resolvedChannel.name || channelName}. Make sure the channel is currently live streaming.`
                    }), { status: 200 });
                }

                vid = liveVideo.id;

            } catch (error) {
                // Enhanced error handling for YouTube.js parser errors
                if (error && typeof (error as any).message === 'string' && (error as any).message.includes('CompositeVideoPrimaryInfo')) {
                    return new Response(JSON.stringify({
                        messages: [],
                        videoId: null,
                        continuation: null,
                        error: `YouTube internal API has changed and the parser is out of date. Please update the youtubei.js library to the latest version. (Parser error: CompositeVideoPrimaryInfo not found)`
                    }), { status: 200 });
                }
                console.error('Error resolving channel and finding live streams:', error);
                return new Response(JSON.stringify({
                    messages: [],
                    videoId: null,
                    continuation: null,
                    error: `Failed to resolve channel "${channelName}": ${error instanceof Error ? error.message : String(error)}`
                }), { status: 200 });
            }
        }

        // Step 2: Get live chat instance
        if (vid) {
            try {
                const videoInfo = await getLiveChatInstance(youtube, vid);

                if (!videoInfo.livechat) {
                    throw new Error('Live chat not available for this video');
                }

                liveChatInstance = videoInfo.livechat;

                // Extract emotes from the live chat
                try {
                    if (liveChatInstance.emojis) {
                        emoteMap = {};
                        emoteNameMap = {};
                        // DEBUG: Log the full emoji pack structure for analysis
                        console.log('DEBUG: FULL liveChatInstance.emojis:', JSON.stringify(liveChatInstance.emojis, null, 2));
                        for (const emoji of liveChatInstance.emojis) {
                            let url = '';
                            if (emoji.image && Array.isArray(emoji.image.thumbnails) && emoji.image.thumbnails.length > 0) {
                                url = emoji.image.thumbnails[emoji.image.thumbnails.length - 1].url;
                            }
                            // Find best name for this emoji
                            let bestName = '';
                            if (emoji.shortcuts && emoji.shortcuts.length > 0) {
                                bestName = emoji.shortcuts[0];
                            } else if (emoji.alt) {
                                bestName = emoji.alt;
                            } else if (emoji.unicode) {
                                bestName = emoji.unicode;
                            } else if (emoji.emojiId) {
                                const parts = emoji.emojiId.split('/');
                                bestName = parts[parts.length - 1] || emoji.emojiId;
                            } else {
                                bestName = 'emoji';
                            }
                            if (url) {
                                // Map by all shortcuts
                                if (emoji.shortcuts && emoji.shortcuts.length > 0) {
                                    for (const shortcut of emoji.shortcuts) {
                                        emoteMap[shortcut] = url;
                                        emoteNameMap[shortcut] = bestName;
                                    }
                                }
                                // Map by emojiId (full)
                                if (emoji.emojiId) {
                                    emoteMap[emoji.emojiId] = url;
                                    emoteNameMap[emoji.emojiId] = bestName;
                                    // Also map by last segment of emojiId for YouTube emotes
                                    const parts = emoji.emojiId.split('/');
                                    if (parts.length > 1) {
                                        emoteMap[parts[parts.length - 1]] = url;
                                        emoteNameMap[parts[parts.length - 1]] = bestName;
                                    }
                                }
                                // Map by unicode if present
                                if (emoji.unicode) {
                                    emoteMap[emoji.unicode] = url;
                                    emoteNameMap[emoji.unicode] = bestName;
                                }
                            } else {
                                // Even if no url, still map name for fallback
                                if (emoji.emojiId) {
                                    emoteNameMap[emoji.emojiId] = bestName;
                                    const parts = emoji.emojiId.split('/');
                                    if (parts.length > 1) {
                                        emoteNameMap[parts[parts.length - 1]] = bestName;
                                    }
                                }
                            }
                        }
                        console.log('DEBUG: emoteMap keys:', Object.keys(emoteMap));
                        // DEBUG: Log the first message run for further analysis
                        if (liveChatInstance.continuation_contents && liveChatInstance.continuation_contents.actions && liveChatInstance.continuation_contents.actions.length > 0) {
                            const firstAction = liveChatInstance.continuation_contents.actions.find((a: any) => a.addChatItemAction && a.addChatItemAction.item && a.addChatItemAction.item.message && a.addChatItemAction.item.message.runs);
                            if (firstAction) {
                                console.log('DEBUG: FIRST MESSAGE RUN:', JSON.stringify(firstAction.addChatItemAction.item.message.runs, null, 2));
                            }
                        }
                    }
                } catch (emoteError) {
                    console.warn('Error extracting emotes:', emoteError);
                }

            } catch (error) {
                console.error('Error getting live chat instance:', error);
                return new Response(JSON.stringify({
                    messages: [],
                    videoId: vid,
                    continuation: null,
                    error: 'Could not get live chat information.'
                }), { status: 200 });
            }
        }

        // Step 3: Get chat messages
        if (liveChatInstance) {
            try {
                let chatData;

                if (cont) {
                    const response = await youtube.actions.execute('live_chat/get_live_chat', {
                        continuation: cont,
                        parse: true
                    });
                    chatData = response.continuation_contents;
                } else {
                    // Check if liveChatInstance has continuation property
                    let initialContinuation = null;

                    if (liveChatInstance.continuation) {
                        initialContinuation = liveChatInstance.continuation;
                    } else if (liveChatInstance.header && liveChatInstance.header.continuation) {
                        initialContinuation = liveChatInstance.header.continuation;
                    }

                    if (!initialContinuation) {
                        const videoInfo = await getLiveChatInstance(youtube, vid);
                        const liveChat = await videoInfo.getLiveChat();

                        if (liveChat && liveChat.initial_info && liveChat.initial_info.continuation) {
                            initialContinuation = liveChat.initial_info.continuation.token;
                        }
                    }

                    if (!initialContinuation) {
                        throw new Error('No initial continuation token available');
                    }

                    const response = await youtube.actions.execute('live_chat/get_live_chat', {
                        continuation: initialContinuation,
                        parse: true
                    });
                    chatData = response.continuation_contents;
                }

                if (!chatData) {
                    console.warn('No chat data returned');
                    return new Response(JSON.stringify({
                        messages: [],
                        videoId: vid,
                        continuation: cont,
                        error: 'No chat data available. The stream may have ended or chat may be disabled.'
                    }), { status: 200 });
                }

                // Extract messages using our helper function
                if (chatData && chatData.actions && chatData.actions.length > 0) {
                    const firstAction = chatData.actions.find((a: any) => a.addChatItemAction && a.addChatItemAction.item && a.addChatItemAction.item.message && a.addChatItemAction.item.message.runs);
                    if (firstAction) {
                        console.log('DEBUG: Sample chat message runs:', JSON.stringify(firstAction.addChatItemAction.item.message.runs, null, 2));
                    }
                }
                const emojiList = liveChatInstance && liveChatInstance.emojis ? liveChatInstance.emojis : undefined;
                const messages = extractMinimalChatMessages(chatData, 50, emoteMap, emoteNameMap, emojiList);

                // Get continuation token for next request
                const newContinuation = chatData.continuation?.token || cont;

                return new Response(JSON.stringify({
                    messages,
                    videoId: vid,
                    continuation: newContinuation,
                    emoteMap
                }), { status: 200 });

            } catch (error) {
                console.error('Error getting chat messages:', error);
                return new Response(JSON.stringify({
                    messages: [],
                    videoId: vid,
                    continuation: cont,
                    error: `Failed to fetch chat messages: ${error instanceof Error ? error.message : String(error)}`
                }), { status: 200 });
            }
        }

        return new Response(JSON.stringify({
            messages: [],
            videoId: vid || null,
            continuation: cont || null,
            error: 'Missing required parameters or unable to initialize chat.'
        }), { status: 200 });

    } catch (err) {
        console.error('YouTube Chat API Error:', err);
        return new Response(JSON.stringify({
            messages: [],
            videoId: null,
            continuation: null,
            error: err instanceof Error ? err.message : String(err)
        }), { status: 200 });
    }
};
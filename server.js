// For the Backend Express server 
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 12000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static('.'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// RSS feed parser endpoint
app.get('/api/rss', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        console.log(`Fetching RSS feed: ${url}`);
        
        // Fetch the RSS feed with proper headers
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'RSS-Pulse/1.0 (RSS Feed Reader)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                'Accept-Encoding': 'gzip, deflate'
            },
            timeout: 10000,
            maxRedirects: 5
        });

        // Parse XML to JSON
        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false,
            mergeAttrs: true
        });

        const result = await parser.parseStringPromise(response.data);
        
        // Handle different RSS/Atom formats
        let feedData;
        if (result.rss && result.rss.channel) {
            // RSS 2.0 format
            feedData = parseRSS(result.rss.channel);
        } else if (result.feed) {
            // Atom format
            feedData = parseAtom(result.feed);
        } else if (result['rdf:RDF']) {
            // RSS 1.0 format
            feedData = parseRDF(result['rdf:RDF']);
        } else {
            throw new Error('Unsupported feed format');
        }

        console.log(`Successfully parsed feed: ${feedData.title} (${feedData.items.length} items)`);
        res.json(feedData);

    } catch (error) {
        console.error('Error fetching RSS feed:', error.message);
        
        let errorMessage = 'Failed to fetch RSS feed';
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Feed URL not found or unreachable';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused by the server';
        } else if (error.response && error.response.status) {
            errorMessage = `Server returned ${error.response.status}: ${error.response.statusText}`;
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Request timeout - feed took too long to respond';
        } else if (error.message.includes('Unsupported feed format')) {
            errorMessage = 'Unsupported or invalid RSS/Atom feed format';
        }

        res.status(500).json({ error: errorMessage });
    }
});

// Parse RSS 2.0 format
function parseRSS(channel) {
    const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
    
    return {
        title: channel.title || 'Unknown Feed',
        description: channel.description || '',
        link: channel.link || '',
        items: items.map(item => ({
            title: item.title || 'Untitled',
            link: item.link || '',
            description: item.description || item['content:encoded'] || '',
            pubDate: item.pubDate || item.date || '',
            author: item.author || item['dc:creator'] || '',
            guid: item.guid || item.link || Math.random().toString(36)
        })).slice(0, 50) // Limit to 50 items per feed
    };
}

// Parse Atom format
function parseAtom(feed) {
    const entries = Array.isArray(feed.entry) ? feed.entry : (feed.entry ? [feed.entry] : []);
    
    return {
        title: feed.title ? (typeof feed.title === 'string' ? feed.title : feed.title._) : 'Unknown Feed',
        description: feed.subtitle ? (typeof feed.subtitle === 'string' ? feed.subtitle : feed.subtitle._) : '',
        link: feed.link ? (Array.isArray(feed.link) ? feed.link[0].href : feed.link.href) : '',
        items: entries.map(entry => ({
            title: entry.title ? (typeof entry.title === 'string' ? entry.title : entry.title._) : 'Untitled',
            link: entry.link ? (Array.isArray(entry.link) ? entry.link[0].href : entry.link.href) : '',
            description: entry.summary ? (typeof entry.summary === 'string' ? entry.summary : entry.summary._) : 
                        (entry.content ? (typeof entry.content === 'string' ? entry.content : entry.content._) : ''),
            pubDate: entry.published || entry.updated || '',
            author: entry.author ? (typeof entry.author === 'string' ? entry.author : entry.author.name) : '',
            guid: entry.id || entry.link || Math.random().toString(36)
        })).slice(0, 50)
    };
}

// Parse RSS 1.0 (RDF) format
function parseRDF(rdf) {
    const items = Array.isArray(rdf.item) ? rdf.item : (rdf.item ? [rdf.item] : []);
    const channel = rdf.channel || {};
    
    return {
        title: channel.title || 'Unknown Feed',
        description: channel.description || '',
        link: channel.link || '',
        items: items.map(item => ({
            title: item.title || 'Untitled',
            link: item.link || '',
            description: item.description || '',
            pubDate: item['dc:date'] || '',
            author: item['dc:creator'] || '',
            guid: item.link || Math.random().toString(36)
        })).slice(0, 50)
    };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'RSS Pulse API'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 RSS Pulse server running on port ${PORT}`);
    console.log(`📡 Access the app at: http://localhost:${PORT}`);
    console.log(`🔗 API endpoint: http://localhost:${PORT}/api/rss?url=<RSS_URL>`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
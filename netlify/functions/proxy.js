// The secure, serverless proxy function for Dividend Depot

// --- CONFIGURATION: PASTE YOUR API KEYS HERE ---
const FINNHUB_API_KEY = "d1r9ch1r01qk8n65kdfgd1r9ch1r01qk8n65kdg0";
const EODHD_API_KEY = " 6876aded433579.23907357"; // <-- IMPORTANT

// Main handler function
exports.handler = async function(event, context) {
    const { action, query, symbol } = event.queryStringParameters;

    try {
        let data;
        if (action === 'search') {
            data = await searchFinnhub(query);
        } else if (action === 'details') {
            const isCanadian = symbol.endsWith('.TO');
            if (isCanadian) {
                data = await getDetailsEODHD(symbol);
            } else {
                data = await getDetailsFinnhub(symbol);
            }
        } else {
            throw new Error("Invalid action specified.");
        }
        
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data)
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message })
        };
    }
};

// --- Helper Functions ---

async function apiFetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API request failed for ${url}`);
    return response.json();
}

async function searchFinnhub(query) {
    const data = await apiFetch(`https://finnhub.io/api/v1/search?q=${query}&token=${FINNHUB_API_KEY}` );
    return (data.result || []).map(item => ({
        symbol: item.symbol,
        description: item.description,
        market: item.symbol.includes('.') ? item.symbol.split('.').pop().replace('TO', 'CAN') : 'US'
    }));
}

async function getDetailsFinnhub(symbol) {
    const [profile, quote, dividends, metrics] = await Promise.all([
        apiFetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}` ),
        apiFetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}` ),
        apiFetch(`https://finnhub.io/api/v1/stock/dividend?symbol=${symbol}&from=2019-01-01&to=${new Date( ).toISOString().split('T')[0]}&token=${FINNHUB_API_KEY}`),
        apiFetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_API_KEY}` )
    ]);
    if (!profile.name) throw new Error(`Could not load Finnhub details for ${symbol}.`);
    return {
        name: profile.name, ticker: profile.ticker, exchange: profile.exchange, logo: profile.logo,
        price: quote.c, yield: metrics.metric.dividendYieldAnnual, payoutRatio: metrics.metric.payoutRatioAnnual,
        dividends: dividends.map(d => ({ date: d.exDate, amount: d.amount }))
    };
}

async function getDetailsEODHD(symbol) {
    const fundamentals = await apiFetch(`https://eodhistoricaldata.com/api/fundamentals/${symbol}?api_token=${EODHD_API_KEY}` );
    if (!fundamentals.General) throw new Error(`Could not load EODHD details for ${symbol}.`);
    
    const divData = fundamentals.Dividends.data;
    const history = Object.entries(divData).map(([date, info]) => ({ date, amount: info.value })).slice(-20);

    return {
        name: fundamentals.General.Name, ticker: fundamentals.General.Code, exchange: fundamentals.General.Exchange, logo: `https://eodhistoricaldata.com${fundamentals.General.LogoURL}`,
        price: fundamentals.Highlights.MarketCapitalization / fundamentals.SharesStats.SharesOutstanding,
        yield: fundamentals.Highlights.DividendYield * 100, payoutRatio: fundamentals.Highlights.PayoutRatio * 100,
        dividends: history
    };
}

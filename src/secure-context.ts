try {
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
    if (location.protocol !== 'file:' && location.protocol !== 'https:' && !isLocalhost) {
        location.replace(`https:${location.href.substring(location.protocol.length)}`);
    }
} catch (error) {
    console.error('Could not verify the browser security context.', error);
}

let PathFork = require('../PathFork')
let http = require('http')

http.createServer({
    IncomingMessage: require('parsedmessage'),
    ServerResponse: require('serverfailsoft'),
}, (req, res) => {
    req.pipe(new PathFork).pipe(res)
}).listen(3000)

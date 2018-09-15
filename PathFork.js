let Transflect = require('@mixint/transflect')
let child_process = require('child_process')

module.exports = class PathFork extends Transflect {
    constructor(opt){
        super(opt)
        this.stdin = this.stdout = this.stderr = []
    }

    /**
     * @param {Object} queryObject - ParsedMessage.query, used for arguments passed to child_process
     * @return {Array} - an array of strings, `key=value` pairs, sans `=` if lacking a value.
     */
    arrayify(queryObject){
        return Object.entries(queryObject).map(tuple =>
            tuple[1] ? tuple.join('=') : tuple[0]
        )
    }

    /**
     * child_process.spawn takes a string executable name, an array of arguments, and an options object
     */
    _open(source){
        return this.fork = child_process.spawn(
            source.pathname,
            this.arrayify(source.query),
            {
                env: process.env,
                cwd: process.cwd()
            }
            // someow my error handler attached in Transflect doesn't attach syncronously...
        ).on('error', error => this.destroy(error))
    }

    _transform(chunk, encoding, done){
        this.stdin = this.stdin.concat(chunk.toString().split('\n'))
        this.fork.stdin.write(chunk) && done() || this.fork.stdin.on('drain', done)
    }

    /**
     * I wonder if I run into a problem here with large bodies,
     * since I don't consume any output until my program accepts all input
     * all program output is buffered. So. If I hit the HighWaterMark on stdout,
     * does that pause the input stream? I know the docs told me about this...
     */
    _flush(done){
        this.fork.stdout.on('data', chunk => {
            this.stdout = this.stdout.concat(chunk.toString().split('\n'))
        })
        this.fork.stderr.on('data', chunk => {
            this.stderr = this.stderr.concat(chunk.toString().split('\n'))
        })

        this.fork.on('exit', (signal, code) => {
            done(null, JSON.stringify({
                source: this.source.pathname,
                args: this.arrayify(this.source.query),
                stdin: this.stdin,
                stdout: this.stdout,
                stderr: this.stderr
            }))
        })
    }
}

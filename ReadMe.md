# PathFork

PathFork is a [Transflect](http://github.com/mixint/transflect) stream released with [MIXINT](http://github.com/mixint/mixint) v0.1.0. It executes the program passed to it from the URL pathname, and passes the & separated arguments from the querystring. The body of the request is piped to stdin of the program, and stdout/stderr are buffered into arrays. Once the program exits, a response body includes a JSON object with fork, error, stdin, stdout, stderr, and exit properties.

Programs that run more than a few seconds may time out. To keep track of long running processes, including tailing the stdout / stderr of ongoing processes, an improvement called TeleFork is planned.

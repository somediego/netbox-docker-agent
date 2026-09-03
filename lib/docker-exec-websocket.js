const DockerExecWebsocketServer = require("docker-exec-websocket-server");
const red = require("node-red");

module.exports = {
    create: (containerId) => {
        const path = `/ws/engine/containers/${containerId}/exec`;

        const server = new DockerExecWebsocketServer.DockerExecServer({
            path: path,
            containerId: containerId,
            server: red.server
        });

        /**
         * docker-exec-websocket-server starts the exec stream with dockerode's
         * { stream, stdin, stdout, stderr } options but without Docker's connection
         * hijack, and then writes the terminal's stdin as `write(buffer, { binary: true })`.
         * Both break input on current dockerode/node:
         *  - without hijack, dockerode returns an HttpDuplex whose writes never reach
         *    the container (output works, typed keys are silently dropped),
         *  - on the hijacked socket, the `{ binary: true }` object is rejected by
         *    node's stream encoding validation (ERR_UNKNOWN_ENCODING), which the
         *    library turns into a closed session.
         * Both are patched here, on the server's own container handle only.
         */
        const containerExec = server.container.exec.bind(server.container);

        server.container.exec = async (execOptions) => {
            const exec = await containerExec(execOptions);
            const execStart = exec.start.bind(exec);

            exec.start = async (startOptions) => {
                const stream = await execStart({ ...startOptions, hijack: true });
                const write = stream.write.bind(stream);

                stream.write = (chunk, encoding, callback) => write(
                    chunk,
                    typeof encoding === "string" ? encoding : undefined,
                    typeof encoding === "function" ? encoding : callback
                );

                return stream;
            };

            return exec;
        };

        return server;
    }
}

import { SkrbeDevAgent } from "./agent.js";
import { loadConfig } from "./config.js";
const AGENT_KEY = Symbol.for("@skrbe/xcoder/next-agent");
/**
 * Starts one XCoder agent per Node.js process.
 * Safe to call repeatedly during Next.js development/HMR.
 */
export function startXCoder(options = {}) {
    if (process.env.NEXT_RUNTIME === "edge")
        return undefined;
    const state = globalThis;
    if (state[AGENT_KEY])
        return state[AGENT_KEY];
    try {
        const config = options.config ?? loadConfig(options.env);
        const agent = new SkrbeDevAgent(config, undefined, options.tools);
        state[AGENT_KEY] = agent;
        agent.start();
        const stop = () => {
            if (state[AGENT_KEY] !== agent)
                return;
            agent.stop();
            delete state[AGENT_KEY];
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        process.once("beforeExit", stop);
        return agent;
    }
    catch (error) {
        if (!options.optional)
            throw error;
        console.warn("[xcoder] inicialização opcional ignorada:", error instanceof Error ? error.message : error);
        return undefined;
    }
}
export function getXCoderAgent() {
    return globalThis[AGENT_KEY];
}
export function stopXCoder() {
    const state = globalThis;
    state[AGENT_KEY]?.stop();
    delete state[AGENT_KEY];
}
//# sourceMappingURL=next.js.map
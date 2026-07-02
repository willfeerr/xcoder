import { promises as fs } from "node:fs";
import path from "node:path";
import { asObject, optionalBoolean, optionalNumber, optionalString, requiredString, sha256 } from "./runtime.js";
export const fsTools = [
    { name: "read_file", description: "Lê um arquivo UTF-8 e retorna texto, tamanho e hash SHA-256.", risk: "read", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, async execute(input, context) { const target = context.resolvePath(requiredString(asObject(input), "path")); const stats = await fs.stat(target); if (!stats.isFile())
            throw new Error(`Não é um arquivo: ${target}`); if (stats.size > context.config.maxReadBytes)
            throw new Error("Arquivo excede SKRBE_MAX_READ_BYTES."); const text = await fs.readFile(target, "utf8"); return { path: target, size: stats.size, sha256: sha256(text), text }; } },
    { name: "list_files", description: "Lista arquivos e diretórios dentro dos roots autorizados.", risk: "read", inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false }, async execute(input, context) { const target = context.resolvePath(optionalString(asObject(input), "path", ".")); const entries = await fs.readdir(target, { withFileTypes: true }); return { path: target, entries: entries.map((entry) => ({ name: entry.name, path: path.relative(context.config.workspace, path.join(target, entry.name)), type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" })) }; } },
    { name: "file_info", description: "Obtém metadados e hash de um arquivo ou diretório.", risk: "read", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, async execute(input, context) { const target = context.resolvePath(requiredString(asObject(input), "path")); const stats = await fs.stat(target); const result = { path: target, type: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other", size: stats.size, modifiedAt: stats.mtime.toISOString() }; if (stats.isFile() && stats.size <= context.config.maxReadBytes)
            result.sha256 = sha256(await fs.readFile(target)); return result; } },
    { name: "search_files", description: "Busca texto em arquivos do workspace sem atravessar node_modules, .git e .next por padrão.", risk: "read", inputSchema: { type: "object", properties: { query: { type: "string" }, path: { type: "string" }, caseSensitive: { type: "boolean" }, maxResults: { type: "number" } }, required: ["query"], additionalProperties: false }, async execute(input, context) { const values = asObject(input); const query = requiredString(values, "query"); const root = context.resolvePath(optionalString(values, "path", ".")); const caseSensitive = optionalBoolean(values, "caseSensitive"); const maxResults = Math.min(500, Math.max(1, optionalNumber(values, "maxResults", 100))); const needle = caseSensitive ? query : query.toLowerCase(); const matches = []; const ignored = new Set(["node_modules", ".git", ".next", "dist", "coverage"]); async function walk(directory) { if (matches.length >= maxResults)
            return; for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            if (matches.length >= maxResults || ignored.has(entry.name))
                continue;
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(absolute);
                continue;
            }
            if (!entry.isFile())
                continue;
            const stats = await fs.stat(absolute);
            if (stats.size > context.config.maxReadBytes)
                continue;
            let text;
            try {
                text = await fs.readFile(absolute, "utf8");
            }
            catch {
                continue;
            }
            const lines = text.split(/\r?\n/);
            for (let index = 0; index < lines.length && matches.length < maxResults; index++) {
                const haystack = caseSensitive ? lines[index] : lines[index].toLowerCase();
                const column = haystack.indexOf(needle);
                if (column >= 0)
                    matches.push({ path: path.relative(context.config.workspace, absolute), line: index + 1, column: column + 1, preview: lines[index].slice(0, 500) });
            }
        } } await walk(root); return { query, root, count: matches.length, truncated: matches.length >= maxResults, matches }; } },
    { name: "write_file", description: "Cria ou substitui um arquivo UTF-8, opcionalmente validando o hash anterior.", risk: "write", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, expectedSha256: { type: "string" }, createDirectories: { type: "boolean" } }, required: ["path", "content"], additionalProperties: false }, async execute(input, context) { const values = asObject(input); const target = context.resolvePath(requiredString(values, "path")); const content = requiredString(values, "content"); const expectedSha = optionalString(values, "expectedSha256"); if (expectedSha) {
            const actual = sha256(await fs.readFile(target, "utf8"));
            if (actual !== expectedSha)
                throw new Error(`Conflito de edição: hash atual ${actual}, esperado ${expectedSha}.`);
        } if (optionalBoolean(values, "createDirectories", true))
            await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.xcoder-${process.pid}-${Date.now()}.tmp`; await fs.writeFile(temporary, content, "utf8"); await fs.rename(temporary, target); return { path: target, bytes: Buffer.byteLength(content), sha256: sha256(content) }; } },
    { name: "apply_patch", description: "Aplica substituições textuais parciais com controle de concorrência por SHA-256.", risk: "write", inputSchema: { type: "object", properties: { path: { type: "string" }, expectedSha256: { type: "string" }, replacements: { type: "array", items: { type: "object", properties: { search: { type: "string" }, replace: { type: "string" }, all: { type: "boolean" } }, required: ["search", "replace"] } } }, required: ["path", "replacements"], additionalProperties: false }, async execute(input, context) { const values = asObject(input); const target = context.resolvePath(requiredString(values, "path")); const expectedSha = optionalString(values, "expectedSha256"); const replacements = values.replacements; if (!Array.isArray(replacements) || replacements.length === 0)
            throw new Error("replacements deve ser uma lista não vazia."); const original = await fs.readFile(target, "utf8"); const originalSha = sha256(original); if (expectedSha && expectedSha !== originalSha)
            throw new Error(`Conflito de edição: hash atual ${originalSha}, esperado ${expectedSha}.`); let next = original; let applied = 0; for (const item of replacements) {
            const replacement = asObject(item);
            const search = requiredString(replacement, "search");
            if (typeof replacement.replace !== "string")
                throw new Error("replace deve ser string.");
            const replace = replacement.replace;
            const occurrences = next.split(search).length - 1;
            if (occurrences === 0)
                throw new Error(`Trecho não encontrado: ${search.slice(0, 120)}`);
            if (optionalBoolean(replacement, "all")) {
                next = next.split(search).join(replace);
                applied += occurrences;
            }
            else {
                next = next.replace(search, replace);
                applied += 1;
            }
        } const temporary = `${target}.xcoder-${process.pid}-${Date.now()}.tmp`; await fs.writeFile(temporary, next, "utf8"); await fs.rename(temporary, target); return { path: target, applied, previousSha256: originalSha, sha256: sha256(next), bytes: Buffer.byteLength(next) }; } },
    { name: "remove_path", description: "Remove um arquivo ou diretório.", risk: "destructive", inputSchema: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" } }, required: ["path"], additionalProperties: false }, async execute(input, context) { const values = asObject(input); const target = context.resolvePath(requiredString(values, "path")); if (path.resolve(target) === path.resolve(context.config.workspace))
            throw new Error("Não é permitido remover o workspace raiz."); await fs.rm(target, { recursive: optionalBoolean(values, "recursive"), force: false }); return { removed: target }; } }
];
//# sourceMappingURL=fs-tools.js.map
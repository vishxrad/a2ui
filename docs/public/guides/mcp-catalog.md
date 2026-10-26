# MCP catalog

`@a2ui/catalog-mcp` integrates Model Context Protocol (MCP) tools and [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) into A2UI v1.0 or later surfaces. It provides the `McpApp` universal component for rendering sandboxed MCP Apps, `callMcpTool` for executing MCP tools and resolving UI resources, and four data functions (`transformData`, `updateDataModel`, `split` and `regexCapture`) for turning headless tool output into data model updates.

`McpApp` is a universal component built on `@a2ui/web_core` that any renderer supporting universal components can render. This guide covers installing the package, registering and configuring the catalog, serving the sandbox asset that `McpApp` loads, calling tools and shaping their output, and embedding `McpApp` components.

## Installation

```bash
npm install @a2ui/catalog-mcp @a2ui/web_core lit
```

`@a2ui/web_core` and `lit` are peer dependencies so your application shares one copy of `Catalog` and `LitElement` across the renderer and catalog packages. `@a2ui/catalog-mcp` includes `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps`.

## Registering and configuring the catalog

Register `mcpCatalog` with `MessageProcessor` alongside `basicCatalog`, and configure the host with `configureMcpCatalog`:

```ts
import {basicCatalog, MessageProcessor} from '@a2ui/web_core/v1_0';
import {configureMcpCatalog, mcpCatalog} from '@a2ui/catalog-mcp';

const processor = new MessageProcessor([basicCatalog, mcpCatalog], action => {
  console.log('Action dispatched:', action);
});

configureMcpCatalog({
  getMcpClientForTool: toolName => mcpClient,
  processor,
});
```

`configureMcpCatalog` accepts the following options (and can be called again to update individual fields):

| Option                | Type                                                    | Purpose                                                                                                                         |
| :-------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------ |
| `getMcpClientForTool` | `(toolName: string) => McpToolClient \| Promise<...>`   | Returns the MCP client (`Pick<Client, 'request' \| 'readResource' \| 'listTools'>`) that handles `toolName`.                    |
| `processor`           | `MessageProcessor`                                      | Receives A2UI messages extracted from tool results and `application/a2ui+json` UI resources.                                    |
| `defaultVersion`      | `string`                                                | Protocol version stamped on decoded tool-result messages that omit `version` (defaults to `'1.0'`).                             |
| `onMcpAppResource`    | `(payload: McpAppResourcePayload, uri: string) => void` | Optional callback invoked when `callMcpTool` resolves a `ui://` (`text/html;profile=mcp-app`) resource.                         |
| `sandbox`             | `Partial<SandboxConfig>`                                | Overrides the sandbox proxy location (`baseUrl`, default `'/a2ui-sandbox/'`) or security self-test (`disableSecuritySelfTest`). |

When no MCP client is configured, `McpApp` dispatches allowed `tools/call` requests from the embedded app as A2UI actions named after the tool, so a host or proxy agent can handle them through the `MessageProcessor` action callback.

### Registering a subset of the catalog

To expose only specific components or functions (for example, `McpApp` and `callMcpTool` without the data functions), derive a restricted catalog with `mcpCatalog.withEntries` or register the individual `*Implementation` exports (`CallMcpToolImplementation`, `TransformDataImplementation`, `UpdateDataModelImplementation`, `SplitImplementation` and `RegexCaptureImplementation`):

```ts
import {CallMcpToolImplementation, mcpCatalog} from '@a2ui/catalog-mcp';

const mcpAppCatalog = mcpCatalog.withEntries(
  [...mcpCatalog.components.values()],
  [CallMcpToolImplementation],
);
```

## Serving the sandbox asset

`McpApp` isolates untrusted HTML inside a double-iframe sandbox loaded from `/a2ui-sandbox/` on your origin. Serve the `node_modules/@a2ui/catalog-mcp/sandbox` directory at `/a2ui-sandbox/`:

- **Angular CLI (`angular.json`)**:

    ```json
    {
      "glob": "**/*",
      "input": "node_modules/@a2ui/catalog-mcp/sandbox",
      "output": "a2ui-sandbox"
    }
    ```

- **Vite (`vite.config.ts` with [`vite-plugin-static-copy`](https://github.com/sapphi-red/vite-plugin-static-copy), or copy into `public/a2ui-sandbox/`)**:

    ```ts
    import {defineConfig} from 'vite';
    import {viteStaticCopy} from 'vite-plugin-static-copy';

    export default defineConfig({
      plugins: [
        viteStaticCopy({
          targets: [
            {src: 'node_modules/@a2ui/catalog-mcp/sandbox/*', dest: 'a2ui-sandbox'},
          ],
        }),
      ],
    });
    ```

- **Static server**: Copy `node_modules/@a2ui/catalog-mcp/sandbox` to `<web root>/a2ui-sandbox`.

If you serve the directory at a different path or on a dedicated sandbox origin, set `sandbox.baseUrl` before rendering the first surface:

```ts
configureMcpCatalog({sandbox: {baseUrl: '/static/frames/'}});
```

## Calling tools and shaping results

A surface created with the basic catalog selects MCP functions by setting `"catalogId": "https://a2ui.org/specification/v1_0/catalogs/mcp/catalog.json"` on each `@call`.

### The `callMcpTool` payload

`callMcpTool` takes the tool `name`, optional `arguments` and an optional `targetDataPath`. It applies any A2UI messages and MCP App UI resources found in the result, then returns a payload with these fields:

| Field               | Value                                                                                                                                     |
| :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `toolName`          | The name of the tool.                                                                                                                     |
| `toolInput`         | The resolved arguments.                                                                                                                   |
| `toolResult`        | The raw MCP `CallToolResult`.                                                                                                             |
| `structuredContent` | `toolResult.structuredContent`, unchanged, when the server sends one.                                                                     |
| `text`              | The `text` content blocks, joined with `\n`.                                                                                              |
| `json`              | `text` parsed when it is a JSON object or array. Otherwise, when two or more text blocks parse to one, an array of those, skipping prose. |

When the result has an MCP App resource, the payload also carries its `resourceUri`, `html`, `csp` and `permissions`. The call throws an `A2uiExpressionError` and writes nothing if the client cannot be resolved, the call returns no result, or the result has `isError: true`.

### Writing results with `targetDataPath`

With `targetDataPath`, each successful call replaces the object at that path with its payload, so components can bind to it with no data functions at all. The second button of [`mcp-json-tool-result.json`](../../../catalogs/mcp/v1/examples/mcp-json-tool-result.json) writes the payload to `/issueResponse`, and a list below it binds its children to `/issueResponse/structuredContent/issues`:

```json
{
  "@call": "callMcpTool",
  "catalogId": "https://a2ui.org/specification/v1_0/catalogs/mcp/catalog.json",
  "args": {
    "name": "list_issues",
    "arguments": {"repository": {"@path": "/repository"}},
    "targetDataPath": "/issueResponse"
  }
}
```

The latest call to a path wins. When a response arrives after a newer call to the same path has started, it is not written and does not reach `onMcpAppResource`, but the call still returns its payload. Out-of-order responses, such as autocomplete suggestions, therefore never replace newer ones. Two rules follow from this:

1. Give each feature its own `targetDataPath`, so calls from unrelated controls do not supersede each other.
2. The guard covers only `targetDataPath` writes. A chain that writes the result with `updateDataModel` can still apply a stale response, so for autocomplete and other inputs that call a tool on every change, bind to `targetDataPath` instead of chaining `updateDataModel`.

### Data functions

Four data functions turn the payload into data model updates:

| Function          | Arguments                                         | Returns                                                                                                                                   |
| :---------------- | :------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `transformData`   | `jmespath: DynamicString`, `data: DynamicValue`   | The result of evaluating the [JMESPath](https://jmespath.org/specification.html) expression against `data`, or `null` for missing fields. |
| `updateDataModel` | `updates: DynamicValue`                           | Nothing. Writes each key-value pair in `updates` to the surface data model.                                                               |
| `split`           | `value: DynamicValue`, `separator: DynamicString` | Substrings of `value` split by the literal `separator`, or its characters if `separator` is empty.                                        |
| `regexCapture`    | `value: DynamicValue`, `pattern: DynamicString`   | The capture groups of the first match of `pattern`, or `null` if there is no match.                                                       |

`transformData` evaluates standard JMESPath, with no extensions, and reports an expression that does not parse as `Invalid JMESPath expression: ...`. In `updateDataModel`, keys starting with `/` are absolute paths and relative keys resolve against the calling data context, such as the current row of a template list. `split` and `regexCapture` take a single string or an array of strings, and apply the operation to each element of an array.

For a tool that returns JSON, `transformData` reads the `json` field of the payload and builds an object of data model paths, and `updateDataModel` writes it. The first button of [`mcp-json-tool-result.json`](../../../catalogs/mcp/v1/examples/mcp-json-tool-result.json) loads the open issues of a repository into `/issues`:

```json
{
  "@call": "updateDataModel",
  "catalogId": "https://a2ui.org/specification/v1_0/catalogs/mcp/catalog.json",
  "args": {
    "updates": {
      "@call": "transformData",
      "catalogId": "https://a2ui.org/specification/v1_0/catalogs/mcp/catalog.json",
      "args": {
        "jmespath": "{\"/issues\": json[?state == 'open'].{number: to_string(number), title: title}}",
        "data": {
          "@call": "callMcpTool",
          "catalogId": "https://a2ui.org/specification/v1_0/catalogs/mcp/catalog.json",
          "args": {
            "name": "list_issues",
            "arguments": {"repository": {"@path": "/repository"}}
          }
        }
      }
    }
  }
}
```

For a tool that answers in text, `split` cuts the `text` field into records and `regexCapture` turns each record into its capture groups, yielding `null` for a record that does not match. An outer `transformData` drops the `null` entries and names the fields (see [`mcp-text-tool-result.json`](../../../catalogs/mcp/v1/examples/mcp-text-tool-result.json), which reads `Title:` and `URL:` records from a search tool).

`regexCapture` patterns use a portable subset of regular expressions that every renderer can implement: JavaScript syntax without lookahead or lookbehind assertions (`(?=`, `(?!`, `(?<=`, `(?<!`) and without backreferences (`\1` to `\9`, `\k<name>`). The web implementation also rejects patterns that allow catastrophic backtracking, with the same check as the basic catalog's `regex` function. A pattern outside the subset raises an `A2uiExpressionError`.

### Adding your own functions

The set of data functions is closed. Every function in the catalog has to be specified, tested and implemented in every renderer, so the catalog only includes functions that many MCP servers need. For any other parser, such as CSV, define the function with `createFunctionImplementation` in a catalog with an id of your own, and register that catalog next to `mcpCatalog`:

```ts
import {
  basicCatalog,
  Catalog,
  createFunctionImplementation,
  DynamicStringSchema,
  MessageProcessor,
} from '@a2ui/web_core/v1_0';
import {mcpCatalog} from '@a2ui/catalog-mcp';
import {z} from 'zod';

const ParseCsvImplementation = createFunctionImplementation(
  {
    name: 'parseCsv',
    returnType: 'any',
    schema: z.object({value: DynamicStringSchema}),
    description: 'Splits CSV text into rows of cells.',
  },
  ({value}) =>
    String(value)
      .split('\n')
      .map(line => line.split(',')),
);

const parsersCatalog = new Catalog(
  'https://example.com/catalogs/parsers.json',
  '1.0',
  [],
  [ParseCsvImplementation],
);

const processor = new MessageProcessor([basicCatalog, mcpCatalog, parsersCatalog], onAction);
```

A payload calls `parseCsv` with `"catalogId": "https://example.com/catalogs/parsers.json"`, and it composes with `callMcpTool` and the data functions like any other call. The [package README](../../../typescript/catalogs/mcp/README.md) explains why each of the four functions is included.

## Embedding an `McpApp` component

`McpApp` renders an MCP App HTML payload inside the sandboxed frame and connects it to the surface data model and allowed tools:

```json
{
  "id": "scene3d_app",
  "component": "McpApp",
  "catalogId": "https://a2ui.org/specification/v1_0/catalogs/mcp/catalog.json",
  "title": "3D Holographic Geometry Studio",
  "allowedTools": ["capture_3d_snapshot"],
  "data": {
    "paths": {
      "scene3d": "/scene3d",
      "modelContext": "/scene3d/modelContext"
    }
  },
  "htmlContent": "<!doctype html><html><body>...<script>...</script></body></html>"
}
```

### Component properties

| Property           | Type                     | Required | Description                                                                                                                                               |
| :----------------- | :----------------------- | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `htmlContent`      | `DynamicString`          | Yes      | The HTML document of the app (`url_encoded:` prefix is decoded first).                                                                                    |
| `title`            | `DynamicString`          | No       | Accessible frame title (defaults to `"MCP App"`).                                                                                                         |
| `allowedTools`     | `string[]`               | No       | MCP tool names the app is allowed to call via `tools/call`. Unlisted tools are rejected with `-32602`.                                                    |
| `allowedFunctions` | `Record<string, object>` | No       | Catalog functions the app may call via `ui/requests/function-call`, mapped to the JSON Schema of their arguments.                                         |
| `data.paths`       | `Record<string, string>` | No       | Maps state keys (including reserved `toolInput`, `toolResult`, and `modelContext` keys) to JSON Pointer paths in the surface data model for two-way sync. |
| `csp`              | `McpAppCsp`              | No       | Content Security Policy domain allowlists (`connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`) from `_meta.ui.csp`.                    |
| `permissions`      | `McpAppPermissions`      | No       | Browser permissions (`camera`, `microphone`, `geolocation`, `clipboardWrite`) delegated from `_meta.ui.permissions`.                                      |

### Styling

`McpApp` starts at `500px` tall until the guest app reports its size via `ui/notifications/size-changed`, and can be styled with CSS custom properties:

| CSS Custom Property                    | Default                                                              | Purpose                                |
| :------------------------------------- | :------------------------------------------------------------------- | :------------------------------------- |
| `--a2ui-sandboxed-frame-height`        | `500px`                                                              | Initial height before auto-resize.     |
| `--a2ui-sandboxed-frame-border`        | `var(--a2ui-border-width, 1px) solid var(--a2ui-color-border, #ccc)` | Frame border.                          |
| `--a2ui-sandboxed-frame-border-radius` | `var(--a2ui-border-radius, 8px)`                                     | Frame corner radius.                   |
| `--a2ui-sandboxed-frame-background`    | `#fff`                                                               | Background behind transparent content. |

## Troubleshooting

- **The frame stays empty and the network panel shows a 404 under `/a2ui-sandbox/`**: Ensure `node_modules/@a2ui/catalog-mcp/sandbox` is copied to `/a2ui-sandbox/` on your server origin, or set `configureMcpCatalog({sandbox: {baseUrl}})` before rendering.
- **Tool or function calls from the app are rejected**: Check the browser console for warnings. Every tool the app calls must be listed in `allowedTools`, and every function must be listed in `allowedFunctions` and registered on `mcpCatalog` or the surface's default catalog.
- **Custom element registration collisions or empty components**: Duplicate copies of `lit` or `@a2ui/web_core` break custom element registration and `Catalog` instance checks. Run `npm dedupe` (or check `npm ls lit @a2ui/web_core`), and in Vite add `resolve: {dedupe: ['lit', '@a2ui/web_core']}` to `vite.config.ts`.

## Further reading

- [`@a2ui/catalog-mcp` README](../../../typescript/catalogs/mcp/README.md): full API reference and multi-server setup.
- [MCP App component specification](../../../catalogs/mcp/v1/mcp_app_specification.md): wire protocol methods, parameters, and sandbox security controls.
- [MCP Apps in A2UI](mcp-apps-in-a2ui.md): end-to-end sample applications with an MCP server and agent.
- [Defining your own catalog](defining-your-own-catalog.md) and [Authoring custom components](authoring-components.md).

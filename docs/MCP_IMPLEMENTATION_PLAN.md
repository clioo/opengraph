# Plan de implementación: companion MCP local opcional

Estado: implementado y verificado con build, unitarias JSdom/Node, E2E standalone y smoke MCP real contra el companion compilado.

## Objetivo y límites

Añadir un proceso Node local que exponga OpenGraph por MCP sobre STDIO y, solo mientras esté activo, levante un servidor HTTP/WebSocket en loopback. HTTP sirve el `dist/` existente y WebSocket sincroniza herramientas MCP con la pestaña. La app debe seguir funcionando sin companion, sin cuenta ni backend: `localStorage` continúa siendo la persistencia y recuperación canónica del modo standalone, y no se cambia el diseño salvo un estado de conexión discreto reutilizando los patrones visuales actuales.

## Arquitectura y sincronización

- `companion` habla JSON-RPC/MCP exclusivamente por `stdin`/`stdout`; diagnósticos van a `stderr` para no corromper el transporte.
- Al arrancar, enlaza HTTP y WebSocket a `127.0.0.1` (puerto efímero por defecto), sirve `dist/` sin listado de directorios y genera una URL de sesión con un token aleatorio en el fragmento `/#sessionToken=…`, nunca en la query. No acepta conexiones remotas.
- La UI lee el token del fragmento, lo elimina inmediatamente con `history.replaceState`, lo envía solo en el primer mensaje WebSocket y registra un adaptador sobre el store. Si no hay sesión o falla la conexión, no cambia ningún flujo actual.
- Solo puede existir una UI autenticada por proceso companion. Un segundo handshake válido reemplaza de forma explícita a la conexión anterior: el servidor cierra el socket previo, descarta su caché y adopta el snapshot/revisión de la pestaña nueva. Nunca mezcla respuestas de dos pestañas.
- El companion mantiene en memoria la última copia confirmada y una `revision` entera por sesión. La UI sigue siendo dueña del documento vivo y persiste cada cambio confirmado en `localStorage` mediante el mecanismo actual.
- Lecturas MCP solicitan un snapshot fresco a la UI. Escrituras envían `{requestId, baseRevision, operations}`; la UI valida y normaliza, aplica todo como una sola transacción de historial, incrementa la revisión, persiste y responde con el snapshot/revisión resultante.
- Revisión optimista: `baseRevision` es obligatorio para toda mutación. Si falta o no coincide, no se aplica nada y se devuelve `REVISION_CONFLICT` con `currentRevision` y snapshot actual; no hay mezcla silenciosa ni last-write-wins.
- El store centraliza cambios confirmados en una API transaccional con origen `local|mcp`, snapshot previo, incremento de revisión y evento. Los cambios visuales durante drag continúan siendo live, pero el drag guarda la posición anterior y confirma una sola transacción al terminar. Los snapshots incluyen `viewport`.
- Ediciones locales confirmadas notifican al companion y avanzan la revisión. Reconexión hace handshake con snapshot y revisión: el estado de la pestaña prevalece para conservar trabajo local; el companion descarta su caché. Cada operación remota es un único paso de `undo`.

## Herramientas MCP

- `get_graph`: devuelve `{revision, document}` normalizado completo.
- `get_active_context`: devuelve `{revision, graphName, selected, activeTool, viewport}`; `selected` incluye el nodo/arista resuelto o `null`, sin inventar selección.
- `apply_graph_operations`: requiere `baseRevision` y aplica un lote atómico discriminado (`add/update/remove_node`, `add/update/remove_edge`, `set_name`, `set_defaults`, `set_models`, `set_viewport`). Primero valida semánticamente una copia completa —IDs únicos, formas, referencias, modelos y límites— y solo entonces normaliza y confirma; cualquier error rechaza el lote entero. Eliminar un nodo elimina sus aristas como hoy.
- `layout_graph`: requiere `baseRevision`, calcula posiciones deterministas para nodos existentes (`direction: right|down`, espaciados y margen acotados), conserva contenido/aristas y aplica el resultado como una transacción.
- `undo`: requiere `baseRevision`, ejecuta exactamente una entrada del historial de la UI, devuelve `changed`, `revision` y documento; conflicto si cambió la revisión esperada.
- `render_graph`: el bridge recibe explícitamente desde `App` una función asociada al `ref` del canvas que reutiliza `renderGraphToBlob`; devuelve PNG como contenido MCP y metadatos de tamaño, o un error accionable si no hay pestaña conectada. No busca DOM implícitamente ni escribe archivos.
- `open_opengraph`: garantiza el servidor, abre o devuelve la URL local autenticada y espera de forma acotada el handshake; devuelve URL, estado de conexión y revisión. Es la única herramienta que puede iniciar la UI.

Todas las herramientas declaran esquemas de entrada/salida estrictos, límites de tamaño y errores estables (`NO_UI`, `REVISION_CONFLICT`, `INVALID_OPERATION`, `RENDER_FAILED`). Las herramientas dependientes del DOM responden `NO_UI` cuando no existe una pestaña conectada; no simulan éxito.

## Seguridad local

- Escuchar solo en `127.0.0.1`; rechazar `Host` que no sea el host/puerto asignado y cualquier `Origin` distinto del origen exacto del servidor. Validar ambos también durante el upgrade WebSocket.
- Token de sesión de alta entropía, de un solo proceso y comparación constante; requerido en handshake WebSocket. No guardarlo en `localStorage`, logs, HTML ni respuestas MCP posteriores a `open_opengraph`.
- CSP restrictiva (`default-src 'self'`; `connect-src 'self' ws://127.0.0.1:<puerto>`), `frame-ancestors 'none'`, `nosniff`, `no-store` para la página de sesión y límites para mensajes, operaciones, nodos y render.
- El servidor acepta solo `GET`/`HEAD`, valida exactamente `Host`, aplica fallback SPA únicamente a `index.html` y valida `Host`, `Origin` y token durante el upgrade WebSocket.
- Resolver rutas contra la raíz absoluta de `dist/`, impedir traversal/symlinks fuera de ella y exponer solo `GET`/`HEAD`. No ejecutar comandos recibidos, no acceder a red externa y cerrar sockets/servidor al terminar STDIO.

## Archivos y cambios previstos

- `package.json` / lockfile: dependencias directas `@modelcontextprotocol/sdk`, `zod`, `ws`, `@types/node` y `@types/ws`; scripts `companion`, `build:companion` y empaquetado; mantener `dev`, `build`, `preview` y tests standalone.
- `tsconfig.companion.json`, `companion/index.ts`, `companion/server.ts`, `companion/session.ts`, `companion/tools.ts`, `companion/schemas.ts`: build Node con emisión separada (`outDir`, resolución Node), transporte STDIO, loopback, revisión, herramientas y validación.
- `src/companion/client.ts`, `src/companion/protocol.ts`, `src/companion/bridge.ts`: handshake, protocolo tipado y adaptación al store/exportador.
- `src/store.ts`: API transaccional para lotes externos, snapshot de contexto y undo remoto; conservar carga, guardado y recovery actuales.
- `src/App.tsx` y, solo si hace falta, `src/index.css`: montar/desmontar el bridge y mostrar conexión discreta sin reestructurar componentes ni tokens de diseño.
- `src/export.ts`: aceptar una ruta de render solicitada por el bridge reutilizando `renderGraphToBlob`; mantener copiar/descargar actuales.
- Tests unitarios junto a cada módulo, configuración Vitest Node separada para `companion/*.test.ts` y `tests/e2e/mcp-companion.spec.ts` que lanza el companion compilado; documentación de ejecución en README.

## Orden de implementación

1. Definir protocolo, esquemas, límites y reducer puro de operaciones/layout; cubrir normalización, atomicidad y conflictos.
2. Añadir bridge opcional al store y WebSocket con handshake/reconexión, sin tocar la experiencia standalone.
3. Implementar loopback seguro que sirve `dist/`, después STDIO MCP y las herramientas de lectura/escritura/undo.
4. Conectar render DOM y apertura de la UI; añadir cierre limpio, errores y estado visual mínimo.
5. Completar pruebas de integración/E2E, build empaquetado y regresión standalone.

## Pruebas

- Unitarias: esquemas y límites; cada operación válida/inválida; lote atómico; cascada de aristas; layout determinista; revisión, conflicto y undo; serialización de errores.
- Servidor: bind exclusivo a IPv4 loopback, rechazo de `Host`/`Origin`/token incorrectos, traversal, métodos y mensajes grandes; `stdout` contiene solo MCP y el cierre de STDIO libera puerto/sockets.
- Bridge/store: cambios locales y MCP convergen, cada lote crea un solo snapshot de historial, la reconexión conserva el documento de la UI y todo cambio confirmado continúa en `localStorage`.
- Herramientas: contratos de las siete herramientas, `NO_UI`, conflicto sin efectos parciales y PNG de `render_graph` con MIME y firma binaria válidos.
- E2E: build de producción, `open_opengraph`, conexión, lectura, edición, layout, undo y render; recarga conserva el grafo. Ejecutar además la suite actual con companion ausente y bloquear cualquier cambio visual no intencionado.

## Criterios de aceptación

- `npm run build`, tests unitarios y E2E existentes/nuevos pasan; cobertura crítica no retrocede.
- La app abierta por Vite o `dist/index.html` conserva exactamente el modo standalone, `localStorage`, historial, exportación y diseño actuales sin requerir companion.
- Un cliente MCP por STDIO puede abrir OpenGraph y usar las siete herramientas; lecturas reflejan la pestaña, escrituras son atómicas y visibles, persistentes y deshacibles.
- Dos escrituras sobre la misma revisión producen un éxito y un `REVISION_CONFLICT`; el segundo intento no altera el grafo.
- Sin UI, las operaciones que la requieren fallan de forma explícita; tras reconectar no se pierde trabajo local.
- HTTP/WS no son accesibles fuera de loopback y rechazan host, origen o token incorrectos; ningún secreto queda persistido o registrado.

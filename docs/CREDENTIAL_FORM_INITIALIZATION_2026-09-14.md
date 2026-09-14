# Credential form initialization protection

Production synthetic-account verification exposed a form-initialization race: a native browser submission could occur before the client submit handler attached. Forms without an explicit method defaulted to GET.

The shared client form now renders a disabled fieldset on the server, enables it only after hydration, and specifies POST as a fallback. Authentication forms, guardian and parent PIN forms, parent setup, teacher profile, and online registration use this guard. Existing JSON submit handlers and field layouts are retained. Forms that expose pending state also disable their fields during submission. JavaScript-disabled users receive a clear explanation.

Validation includes server-rendered control and POST-fallback tests, plus real-component browser fixtures in Chromium and WebKit. Each engine covers three hydrated rejection/recovery flows and five JavaScript-disabled/native-fallback cases. APIs are intercepted and only fabricated test values are used. Generated QA outputs are excluded from lint/typecheck; application source and test source remain included.

One synthetic test credential affected by the observed race was replaced and verified. Private evidence remains outside the public repository. No customer credentials were used in this test, and the work did not change customer identities, grants, billing records or messages. Production role verification resumes after the protected deployment is confirmed.

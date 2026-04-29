# TypeScript Enforcement Rules

- **Strict Type Safety:** Always write code in TypeScript (`.ts`/`.tsx`). Never output JavaScript (`.js`/`.jsx`).
- **No Implicit `any`:** Never use `any`. Define explicit interfaces or types for props, function parameters, and return values.
- **Modern Syntax:** Prefer functional components with React hooks and explicit type annotations.
- **Type Inference vs. Explicit:** When in doubt, prefer explicit declarations for clarity and maintainability.
- **Imports:** Always use ES module import/export syntax. Never use `require()` or `module.exports`.
- **Validation:** If unsure of a type, define a specific interface based on the data structure rather than bypassing the type system.

<!-- BEGIN:nextjs-agent-rules -->
# Next.js Project Notes

This project uses Next.js App Router with TypeScript. Check the installed Next.js docs in `node_modules/next/dist/docs/` before using APIs that may have changed.
<!-- END:nextjs-agent-rules -->

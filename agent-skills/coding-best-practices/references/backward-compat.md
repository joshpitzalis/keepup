# Backward-Compatible TypeScript API Evolution

When you change code that other code already calls, the callers didn't get a vote. Every existing call site is a contract you're bound by. Honor those contracts while still shipping the new behavior.

Remember Hyrum's Law: with enough users, all observable behavior of an API will be depended on by somebody—not just the documented contract. Payload shapes, errors, field ordering, and timing can all matter. Compilation alone does not prove compatibility; old calls must also behave identically.

## Identify the blast radius

Before changing an existing function, method, class, or type:

- Search the codebase for every call site. Internal-only symbols with known callers can often be updated everywhere at once; that is simpler than compatibility machinery.
- Treat exported package APIs and serialized data—saved files, API responses, local storage, and database rows—as having unknown external callers. Compatibility is mandatory when you cannot update every consumer.
- Check the project's compatibility policy. A pre-1.0 internal tool whose consumers deploy together may prefer a clean cut. When the guarantee is unclear and the change is hard to reverse, ask.

State the conclusion before proceeding: `N internal call sites, updatable` or `exported/persisted—must stay compatible`.

When the answer is internal, update every call site, test, doc, and config reference. Search for the old names and remove obsolete paths and stale shims. Passing tests alone does not prove that the replacement is complete.

## Classify the change

Usually non-breaking:

- Add an optional parameter or a defaulted parameter at the end of a parameter list.
- Add a new function, method, class, or export.
- Add optional properties to an input type or properties to a return type.
- Widen an input type or narrow a return type.

Breaking unless handled explicitly:

- Add a required parameter.
- Remove or rename a public symbol or field.
- Change a parameter or return type incompatibly.
- Reorder parameters.
- Narrow an input type or widen a return type.
- Change errors, side effects, or observable behavior that callers may rely on.
- Change a serialized or persisted format without reading the old format.

## Pick the lightest compatible technique

Prefer the first option that preserves old calls and behavior. Every compatibility layer carries maintenance cost.

### Optional parameters with defaults

Use a default that exactly preserves the old behavior.

```typescript
function sendEmail(
  subject: string,
  message: string,
  recipients: string[],
  cc: string[] = [],
): void {
  // Old calls behave identically; new calls can pass CC recipients.
}
```

### Overload signatures

Use overloads when supported call shapes genuinely differ. Keep old signatures and add the new ones.

```typescript
function calculateArea(shape: "square", size: number): number;
function calculateArea(shape: "circle", radius: number): number;
function calculateArea(
  shape: "rectangle",
  width: number,
  height: number,
): number;
function calculateArea(shape: string, d1: number, d2?: number): number {
  if (shape === "rectangle" && d2 !== undefined) return d1 * d2;
  if (shape === "square") return d1 * d1;
  if (shape === "circle") return Math.PI * d1 * d1;
  throw new Error("Invalid shape or parameters");
}
```

### Options-object migration

When more parameters are likely, accept an optional final options object. Future optional fields remain additive.

```typescript
interface SendOptions {
  cc?: string[];
  bcc?: string[];
  priority?: "low" | "normal" | "high";
}

function sendEmail(
  subject: string,
  message: string,
  recipients: string[],
  options: SendOptions = {},
): void {}
```

### Subclassing or polymorphism

When behavior must vary for some consumers, extend instead of editing the legacy behavior. An override must still satisfy the superclass contract when called through the old shape.

```typescript
class Document {
  printDoc(): void {}
}

class PhotoDocument extends Document {
  printDoc(colour = false): void {}
}
```

### Adapter or facade

- Use an adapter when a new implementation must conform to an old interface, or vice versa.
- Use a facade when callers need a stable interface in front of a subsystem that will keep changing.

### Versioned functions or formats

Keep versions alongside each other only when behaviors cannot coexist through defaults or overloads—typically wire formats, saved data, and public APIs. Migrate old data while reading it instead of supporting every version forever.

```typescript
type SaveData =
  | { version: 1; score: number }
  | { version: 2; score: number; inventory: string[] };

function load(data: SaveData): GameState {
  if (data.version === 1) return migrateV1(data);
  return fromV2(data);
}
```

## Deprecation

Mark compatibility-only shapes in the artifact itself:

```typescript
/** @deprecated Use sendEmail with SendOptions instead. Removed in v3. */
```

A useful deprecation names the replacement and a specific removal version or date. Before removal, verify that current usage is zero; the announced date is a target, not a substitute for checking.

## Deliberate breaking changes

When compatibility machinery costs more than it is worth, break deliberately:

- Declare the breaking change in the commit and changelog.
- Ship a semantic-version major bump.
- Include a one-line migration path.
- Prefer an immediate compile error or diagnostic over silent behavioral drift.

## Code review mode

For every touched symbol that existed before the change, check:

1. **Signature:** Did an exported function, method, class, or type change shape?
2. **Behavior:** Did defaults, errors, side effects, or output change for old inputs?
3. **Data format:** Can the new code still read old serialized or persisted data?
4. **Tests:** Do the pre-existing tests pass without modification?

## Completion criteria

- Every existing call site or external-consumer assumption is accounted for.
- Each signature, behavior, and data-format change is classified.
- The lightest technique that preserves old behavior is used, or the deliberate break is documented.
- Old calls still behave identically, not merely compile.
- Existing tests survive unmodified; add the smallest runnable compatibility check when the change is non-trivial.

---
name: ngrx-signal-store
description: NgRx SignalStore — store creation, entity management, effects, testing
paths: ["**/*.ts", "**/*.store.ts"]
---

## NgRx SignalStore — Quick Reference

Concise notes on NgRx SignalStore based on the official documentation.

### Installation

```bash
npm install @ngrx/signals @ngrx/signals/entities @ngrx/signals/rxjs-interop
npm install @ngrx/eslint-plugin --save-dev   # Optional lint rules
```

### Creating a Store

Use `signalStore(...)` combining features: `withState`, `withComputed`, `withMethods`, `withProps`. Each state slice becomes a `Signal`/`DeepSignal`, accessible as `store.prop()`.

### Lifecycle Hooks

Use lifecycle hooks to initialize resources or clean up subscriptions when the store is instantiated or destroyed.

### Custom Store Properties

`withProps` adds static properties, observables, or injected dependencies. Useful for exposing services or internal constants.

### Linked State

Link state between stores or signals using `computed` to keep reactive relationships without duplicating data.

### State Tracking

SignalStore generates deep signals (`DeepSignal`) for nested properties; tracking is granular and lazy for deep properties.

### Private Members

Declare private members inside `withProps`/`withMethods` to encapsulate internal logic. Keep the public API minimal.

## Custom Store Features

Reusable logic via `signalStoreFeature(...features)`. Use standalone updater functions for tree-shaking.

### Factory with standalone updaters — Request status

```ts
// with-request-status.ts
export type RequestStatus = 'idle'|'pending'|'fulfilled'|{error:string};
export function withRequestStatus(){
  return signalStoreFeature(
    withState<{requestStatus:RequestStatus}>({requestStatus:'idle'}),
    withComputed(({requestStatus})=>({
      isPending: computed(()=>requestStatus()==='pending'),
      isFulfilled: computed(()=>requestStatus()==='fulfilled'),
      error: computed(()=> typeof (requestStatus() as any)==='object' ? (requestStatus() as any).error : null),
    }))
  );
}
export const setPending = () => ({requestStatus:'pending' as RequestStatus});
export const setFulfilled = () => ({requestStatus:'fulfilled' as RequestStatus});
export const setError = (e:string) => ({requestStatus:{error:e} as RequestStatus});
// usage
export const BooksStore = signalStore(withEntities<Book>(), withRequestStatus(),
  withMethods((s, svc=inject(BooksService))=>({ async loadAll(){
    patchState(s,setPending()); patchState(s,setAllEntities(await svc.getAll()),setFulfilled());
  }})));
```

### Logger — withHooks + getState

```ts
export function withLogger(name:string){
  return signalStoreFeature(withHooks({ onInit(store){
    effect(()=> console.log(`${name} state changed`, getState(store)));
  }}));
}
// signalStore(withEntities<Book>(), withRequestStatus(), withLogger('books'))
```

### Input: state — Selected entity

Feature declares required state via `type<T>()`; consumer must provide it (e.g. `withEntities`).

```ts
export function withSelectedEntity<Entity>(){
  return signalStoreFeature({state:type<EntityState<Entity>>()},
    withState<{selectedEntityId:EntityId|null}>({selectedEntityId:null}),
    withComputed(({entityMap,selectedEntityId})=>({
      selectedEntity: computed(()=> selectedEntityId() ? entityMap()[selectedEntityId()!] : null)
    })));
}
// BooksStore = signalStore(withEntities<Book>(), withSelectedEntity<Book>())
```

### Input: props + methods

```ts
export function withBaz<Foo extends string|number>(){
  return signalStoreFeature(
    { props:type<{foo:Signal<Foo>}>() , methods:type<{bar(foo:number):void}>() },
    withMethods(s=>({ baz(){ s.bar(typeof s.foo()==='number'? s.foo() as number : Number(s.foo())) } })));
}
```

### Composing features — SignalStoreFeatureType & withFeature

```ts
// extract input type of a factory
export type RequestStatusFeature = SignalStoreFeatureType<typeof withRequestStatus>;

export function withStatusMessage(){
  return signalStoreFeature(type<RequestStatusFeature>(),
    withComputed(({isPending,error})=>({ statusMessage: ()=> isPending() ? 'Loading...': error() ?? 'Ready' })));
}

// external signal as input via withFeature (no coupling to internal state)
export function withBooksFilter(books: Signal<Book[]>){
  return signalStoreFeature(withState({query:''}),
    withComputed(({query})=>({ filteredBooks: computed(()=> books().filter(b=>b.name.includes(query()))) })),
    withMethods(s=>({setQuery(q:string){patchState(s,{query:q})} })));
}
export const BooksStore = signalStore(withEntities<Book>(),
  withFeature(({entities})=> withBooksFilter(entities)));
```

### Known TypeScript pitfall

Multiple input-features without generics can fail to compile. Add unused generic `<_>`:

```ts
function withZ<_>(){ return signalStoreFeature({state:type<{x:number}>()}, withState({z:10})) }
function withW<_>(){ return signalStoreFeature({state:type<{y:number}>()}, withState({w:100})) }
const Store = signalStore(withState({x:10,y:100}), withZ(), withW()); // ✅
```

### Entity Management

Use the `entities` plugin to manage normalized collections (efficient CRUD, upserts, optimized selectors).

### Events and Effects

For complex side-effects use `rxMethod` (RxJS interop) or injected services inside `withMethods`. Handle errors with `tapResponse` and update state with `patchState`.

### Testing

Stores are injectable: provide them locally in tests and use `inject()` to obtain instances. Test signals, methods, and effects in isolation.

### Compact Example

```ts
import { computed, inject } from '@angular/core';
import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';

export const BookSearchStore = signalStore(
  withState({ books: [], isLoading: false, filter: { query: '', order: 'asc' } }),
  withComputed(({ books, filter }) => ({ booksCount: computed(() => books().length) })),
  withMethods((store, booksService = inject(BooksService)) => ({
    updateQuery(query: string) { patchState(store, (s) => ({ filter: { ...s.filter, query } })); },
    loadByQuery: rxMethod<string>(/* rx pipeline */),
  }))
);

## CLI Commands

```bash
# Generate a store manually (create file, no ng generate for signal stores yet)
touch src/app/features/{name}/{name}.store.ts

# Run tests after creating store
ng test --include="**/{name}.store.spec.ts"
```

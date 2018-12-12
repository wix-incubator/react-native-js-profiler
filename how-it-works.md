# How it works

Consider this example:

```js
function wait(ms) {
  let s = Date.now();
  while(Date.now() - s < ms) { /* do nothing */ }
}

// Imagine this is the entry point for one of the modules
function myFunc() {
  wait(500);
  setTimeout(() => wait(500), 10);
  Promise.resolve().then(() => wait(500));
  fetch('some').then(() => wait(500));
}
```

How can the performance impact of `myFunc` can be measured? 

The **first naive approach** is to simply measure the execution time of that function:

```js
var totalTime = 0;

function track(fn) {
  let s = Date.now();
  fn();
  const delta = Date.now() - s;
  totalTime += delta;
}

track(() => myFunc());


console.log(totalTime); // 500ms
```


## Problem

Async callbacks are not measured.

## Solution

**1. Patch react-native timers**

```js
var oritinalSetTimeout = setTimeout;
setTimeout = (cb, ms) =>
  originalSetTimeout(() => track(cb), ms);

track(() => myFunc());


console.log(totalTime); // 1000ms
```

Now `setTimeout` callback is tracked, but `Promise.resolve` is not,
because it uses `setImmediate` under the hood.
Let’s patch other timers:

```js
patchTimer('setTimeout');
patchTimer('setInterval');
patchTimer('setImmediate');
patchTimer('requestAnimationFrame');
patchTimer('requestIdleCallback');
track(() => myFunc());


console.log(totalTime); // 1500ms
```

Good, all the jobs, scheduled for later are taken into account.

**2. Patch callbacks to native**
When using native APIs we provide some callbacks and wait for native side to invoke them.
Most of them are done via `BatchedBridge.enqueueNativeCall` and `NativeEventEmitter#addListener`.

```js
const otiginalEnqueueNativeCall = BatchedBridge.enqueueNativeCall.bind(BatchedBridge);

BatchedBridge.enqueueNativeCall = (moduleID, methodID, args, resolve, reject) => {
  return otiginalEnqueueNativeCall(
    moduleID,
    methodID,
    args,
    () => track(resolve),
    () => track(reject),
  );
};

track(() => myFunc());


console.log(totalTime); // 2000ms
```

Perfect!

**3. What about React components, registered by that method?**
Our module can register some React components that will be used later elsewhere,
it’s good to track everything it’s performing as part of the measured function.
This is where things get trickier, but I looks like patching `AppRegistry.registerComponent`,
`AppRegistry.registerRunnable` & &`AppRegistry.runApplication` can help to achieve this.


## FAQ

**Does it track rendering? Should ReactComponent#render() be patched?**
All the subsequent invocations any JS methods should be tracked by this solution, `render()` is no different in that sense. But it’s needed to mention, that sometimes React delays updating the components tree to let other jobs performed. Then a signal to continue updating is sent from native. Those delayed jobs are not tracked for now. As well as some callbacks related to animations.

**Does this solution guarantee to track everything?**
No. I can imaging there are still some APIs that are not taken into consideration and can break this mechanism. Please tell me if you have found one.


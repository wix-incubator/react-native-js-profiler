import {Event} from 'detox-instruments-react-native-utils';

const contextStack = [];

const accTimeByContext = {};

let timer;
let previousMessage;

export const executeInContext = (context, message, fn, ...args) => {
  if (!accTimeByContext[context]) {
    accTimeByContext[context] = {};
  }
  const prevContext = getContext();
  if (prevContext) {
    if (!accTimeByContext[prevContext][previousMessage]){
      accTimeByContext[prevContext][previousMessage] = 0
    }
    accTimeByContext[prevContext][previousMessage] += (now() - timer);
  }
  previousMessage = message
  timer = now();
  contextStack.push(context);
  const result = fn(...args);
  contextStack.pop();
  if (!accTimeByContext[context][message]){
    accTimeByContext[context][message] = 0
  }
  accTimeByContext[context][message] += (now() - timer);
  timer = now();
  previousMessage = message
  return result;
};

const bindContext = (context,message, fn) => (...args) => executeInContext(context, message, fn, ...args);

export const getContext = () => contextStack[contextStack.length - 1];
export const getPerfInfo = () => accTimeByContext;
export const clearPerfInfo = () => {
  Object.keys(accTimeByContext).forEach((k) => accTimeByContext[k] = 0);
}

export const timeAndLog = (fn, message, context, scope = 'General') => {
  /* istanbul ignore else */
  if (__DEV__) {
    const event = new Event(scope, message);
    event.beginInterval(`${message} [${context}]`);
    const result = executeInContext(context,message, fn);
    event.endInterval(Event.EventStatus.completed);
    return result;
  } else {
    return fn();
  }
}

export const attach = () => {
  if (__DEV__) {
    attachRequire();
    patchTimer('setTimeout');
    patchTimer('setInterval');
    patchTimer('setImmediate');
    patchTimer('requestAnimationFrame');
    patchTimer('requestIdleCallback');
    patchBridge();
    patchEventEmitter();
    patchAppRegistry();
    patchAnimated();
  }
};

export const attachRequire = () => {
  const eventsStack = [];
  /* istanbul ignore else */
  if (require.Systrace) {
    require.Systrace.beginEvent = (message) => {
      const context = contextStack.join('->');
      const skip = !message || message.indexOf('JS_require_') !== 0;
      message = message && message.substr('JS_require_'.length);
      const event = !skip && new Event('Systrace', `require()`);
      const finalDescription = `${message} ([${context}])`;
      eventsStack.push({event, skip});
      if (!skip) {
        event.beginInterval(finalDescription);
      }
    };
    require.Systrace.endEvent = () => {
      const event = eventsStack.pop();
      if (event && !event.skip) {
        event.event.endInterval();
      }
    };
  }
}

const patchTimer = (timerName) => {
  const JSTimers = require('react-native/Libraries/Core/Timers/JSTimers');
  const originalTimer = JSTimers[timerName];
  const patchedTimer = (fn, ...args) => {
    let context = getContext();
    // if (!context) { debugger; };
    return originalTimer((...a) => executeInContext(
      context,
      timerName,
      () => fn(...a),
    ), ...args);
  };
  JSTimers[timerName] = patchedTimer;
  defineProperty(global, timerName, patchedTimer);
};

const patchAnimated = () => {
  const NativeAnimatedHelper = require('react-native/Libraries/Animated/src/NativeAnimatedHelper');
  const orig = NativeAnimatedHelper.API.startAnimatingNode;
  NativeAnimatedHelper.API.startAnimatingNode = (node, nodeTag, config, endCallback) => {
    let context = getContext();
    if (!context) {
      context = 'untrackableAnimation';
    };
    return orig(node, nodeTag, config, bindContext(context, "NativeAnimatedHelper" , endCallback));
  }
}

const patchBridge = () => {
  const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
  const orig = BatchedBridge.enqueueNativeCall.bind(BatchedBridge);
  if (!BatchedBridge._remoteModuleTable || !BatchedBridge._remoteMethodTable) {
    return;
  }
  BatchedBridge.enqueueNativeCall = (moduleID, methodID, args, resolve, reject) => {
    let context = getContext();
    const moduleName = BatchedBridge._remoteModuleTable[moduleID]
    const methodName = BatchedBridge._remoteMethodTable[moduleID][methodID]
    // if ((resolve || reject) && !context) { debugger; };
    return orig(
      moduleID,
      methodID,
      args,
      resolve && bindContext(context, `${moduleName}: ${methodName}`, resolve),
      reject && bindContext(context, `${moduleName}: ${methodName}` , reject),
    );
  };
};

const patchEventEmitter = () => {
  const NativeEventEmitter = require('react-native/Libraries/EventEmitter/NativeEventEmitter');
  const orig = NativeEventEmitter.prototype.addListener;

  NativeEventEmitter.prototype.addListener = function (eventType, listener, ...a) {
    let context = getContext();
    // if (!context) { debugger; };
    return orig.call(
      this,
      eventType,
      bindContext(context, "NativeEventEmitter", listener),
      ...a
    );
  };
};

const patchAppRegistry = () => {
  const {AppRegistry} = require('react-native');

  const contextsByAppKeys = {};

  ['registerComponent', 'registerRunnable'].forEach((regName) => {
    const orig = AppRegistry[regName];
    AppRegistry[regName] = (appKey, ...props) => {
      let context = getContext();
      // if (!context) { debugger; };
      contextsByAppKeys[appKey] = context;
      return orig(appKey, ...props);
    };
  });

  const origRun = AppRegistry.runApplication;
  AppRegistry.runApplication = (appKey, ...args) => {
    let context = contextsByAppKeys[appKey];
    // if (!context) { debugger; };
    return executeInContext(context, "patchAppRegistry", origRun, appKey, ...args);
  };
};

const defineProperty = (object, name, value) => {
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  if (descriptor) {
    const backupName = `originalRN${name[0].toUpperCase()}${name.substr(1)}`;
    Object.defineProperty(object, backupName, descriptor);
  }

  const {enumerable, writable, configurable} = descriptor || {};
  /* istanbul ignore next */
  if (descriptor && !configurable) {
    console.error('Failed to attach profiler. ' + name + ' is not configurable.');
    return;
  }

  Object.defineProperty(object, name, {
    value,
    enumerable: enumerable !== false,
    writable: writable !== false,
    configurable: true,
  });
};

const now = (() => {
  if (typeof performance === 'object' && performance.now) {
    return performance.now.bind(performance);
  }
  return Date.now.bind(Date);
})()

// Used in unit tests
export const $require = require;

const mockEventConstructor = jest.fn();
const mockBeginInterval = jest.fn();
const mockEndInterval = jest.fn();
function mockEvent(...args) {
  mockEventConstructor(...args);
  this.beginInterval = mockBeginInterval;
  this.endInterval = mockEndInterval;
}
mockEvent.EventStatus = {};
const mockTimeout = setTimeout;

jest.mock('detox-instruments-react-native-utils', () => ({
  Event: mockEvent,
}));

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => require('events'));

jest.mock('react-native', () => {
  const apps = {};
  return {
    AppRegistry: {
      registerComponent: (appKey, fn) => apps[appKey] = fn,
      runApplication: (appKey) => apps[appKey](),
    }
  };
});

jest.mock('react-native/Libraries/BatchedBridge/BatchedBridge', () => {
  let cb;
  return {
    enqueueNativeCall: (name, $$, $$$, onSuccess, onFail) => {
      cb = onSuccess;
    },
    __mockInvokeCallback: () => cb(),
    _remoteModuleTable:{"0" : "moduleName"},
    _remoteMethodTable:{"0" : ["methodName"]}
  };
});

jest.mock('react-native/Libraries/Core/Timers/JSTimers', () => ({
  setTimeout: mockTimeout,
}));

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => {
  let cb;
  return {
    API: {
      startAnimatingNode: (node, nodeTag, config, endCallback) => {
        cb = endCallback;
      },
    },
    __mockInvokeCallback: () => cb(),
  }
});

describe('JSPerfProfiler', () => {
  let JSPerfProfiler;

  beforeEach(() => {
    jest.resetModules();
    JSPerfProfiler = require('./JSPerfProfiler');
    JSPerfProfiler.$require.Systrace = {};
    JSPerfProfiler.attach();
  });

  it('Should ignore unmatching end events', () => {
    JSPerfProfiler.attach();
    JSPerfProfiler.$require.Systrace.endEvent();
    JSPerfProfiler.$require.Systrace.endEvent();
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockBeginInterval).not.toHaveBeenCalled();
    expect(mockEndInterval).not.toHaveBeenCalled();
  });

  it('Should create events for DetoxInstruments', () => {
    JSPerfProfiler.attach();
    JSPerfProfiler.$require.Systrace.beginEvent('JS_require_');
    expect(mockBeginInterval).toHaveBeenCalledWith(' ([])');
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockEndInterval).toHaveBeenCalledTimes(1);
    expect(mockEventConstructor.mock.calls).toEqual([
      ['Systrace', 'require()']
    ]);
  });

  it('should filter events', () => {
    JSPerfProfiler.attach();
    JSPerfProfiler.$require.Systrace.beginEvent('Some');
    expect(mockBeginInterval).toHaveBeenCalledTimes(0);
    JSPerfProfiler.$require.Systrace.beginEvent('JS_require_');
    expect(mockBeginInterval).toHaveBeenCalledTimes(1);
    JSPerfProfiler.$require.Systrace.beginEvent('Any');
    expect(mockBeginInterval).toHaveBeenCalledTimes(1);
    JSPerfProfiler.$require.Systrace.beginEvent('JS_require_');
    expect(mockBeginInterval).toHaveBeenCalledTimes(2);
    JSPerfProfiler.$require.Systrace.beginEvent('Other');
    expect(mockBeginInterval).toHaveBeenCalledTimes(2);
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockEndInterval).toHaveBeenCalledTimes(0);
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockEndInterval).toHaveBeenCalledTimes(1);
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockEndInterval).toHaveBeenCalledTimes(1);
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockEndInterval).toHaveBeenCalledTimes(2);
    JSPerfProfiler.$require.Systrace.endEvent();
    JSPerfProfiler.$require.Systrace.endEvent();
    JSPerfProfiler.$require.Systrace.endEvent();
    expect(mockEndInterval).toHaveBeenCalledTimes(2);
    expect(mockBeginInterval).toHaveBeenCalledTimes(2);
  });

  it('should time and log events', () => {
    JSPerfProfiler.timeAndLog(() => {}, 'testMessage', 'testModule');
    expect(mockEventConstructor.mock.calls).toEqual([
      ['General', 'testMessage'],
    ]);
    expect(mockBeginInterval).toHaveBeenCalledWith('testMessage [testModule]');
    expect(mockEndInterval).toHaveBeenCalledWith(undefined);
  });


  it('should return results from time and log events', () => {
    const result = JSPerfProfiler.timeAndLog(() => 'RESULT', 'testMessage', 'testModule');
    expect(result).toEqual('RESULT');
  });

  it('Should track context for timers', (done) => {
    const JSTimers = require('react-native/Libraries/Core/Timers/JSTimers');
    JSPerfProfiler.executeInContext('testContext', "message", () => {
      JSTimers.setTimeout(() => {
        expect(JSPerfProfiler.getContext()).toBe('testContext');
        expect(JSPerfProfiler.getPerfInfo()["testContext"]).toHaveProperty('message');
        done();
      }, 1);
    });
  });

  it('Should track context for Bridge', (done) => {
    const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
    // BatchedBridge.createDebugLookup(1, 'test', ['a'])
    JSPerfProfiler.executeInContext('testContext',"message", () => {
      BatchedBridge.enqueueNativeCall(
        0,
        0,
        [],
        () => {
          expect(JSPerfProfiler.getContext()).toBe('testContext');
          expect(JSPerfProfiler.getPerfInfo()["testContext"]).toHaveProperty('message');
          done();
        },
        () => {
          expect(JSPerfProfiler.getContext()).toBe('testContext');
          expect(JSPerfProfiler.getPerfInfo()["testContext"]).toHaveProperty('message');
          done();
        },
      );
    });
    BatchedBridge.__mockInvokeCallback();
  });

  it('Should track context for EventEmitter', (done) => {
    const NativeEventEmitter = require('react-native/Libraries/EventEmitter/NativeEventEmitter');
    const emitter = new NativeEventEmitter();
    JSPerfProfiler.executeInContext('testContext',"message", () => {
      emitter.addListener('tev', () => {
        expect(JSPerfProfiler.getContext()).toBe('testContext');
        expect(JSPerfProfiler.getPerfInfo()["testContext"]).toHaveProperty('message');
        done();
      }, 1);
    });
    emitter.emit('tev');
  });

  it('Should track context for AppRegistry', (done) => {
    const {AppRegistry} = require('react-native');
    JSPerfProfiler.executeInContext('testContext',"message", () => {
      AppRegistry.registerComponent('TestApp', () => {
        expect(JSPerfProfiler.getContext()).toBe('testContext');
        expect(JSPerfProfiler.getPerfInfo()["testContext"]).toHaveProperty('message');
        done();
      });
    });
    AppRegistry.runApplication('TestApp');
  });

  it('Should track context for Animated', (done) => {
    const NativeAnimatedHelper = require('react-native/Libraries/Animated/NativeAnimatedHelper');
    JSPerfProfiler.executeInContext('testContext',"message", () => {
      NativeAnimatedHelper.API.startAnimatingNode('', '', '', () => {
        expect(JSPerfProfiler.getContext()).toBe('testContext');
        expect(JSPerfProfiler.getPerfInfo()["testContext"]).toHaveProperty('message');
        done();
      });
    });
    NativeAnimatedHelper.__mockInvokeCallback();
  });
});


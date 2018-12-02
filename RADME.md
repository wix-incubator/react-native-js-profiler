# ReactNative JS Profiler

Track the performance impact for a given function incluing various async callbacks and RN callbacks.


Usage:

```js
import {
  attach,
  timeAndLog,
} from 'react-native-js-profiler';

attach();

timeAndLog(initModuleA, 'MyMessage', 'ModuleAContext', 'GeneralScope');

```

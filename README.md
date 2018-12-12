# ReactNative JS Profiler

This projects tries to measure the performance impact on JS thread by different app modules.
It attempts to do so by measuring execution time in of a given function and also measuring callbacks
of asynchronous operations starting inside.

How it works:
-------------

See [how-it-works.md](how-it-works.md)


Usage:
------

```js
import {
  attach,
  timeAndLog,
} from 'react-native-js-profiler';

attach();

timeAndLog(initModuleA, 'MyMessage', 'ModuleAContext', 'GeneralScope');

```

TODO
----
* More generic API: don't depend on detox-instruments-react-native-utils

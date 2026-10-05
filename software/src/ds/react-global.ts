// The design system bundle is a UMD-style script that reads window.React. This must run before it loads.
import React from "react";
(window as unknown as { React: typeof React }).React = React;

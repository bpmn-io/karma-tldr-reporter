import bpmnIoPlugin from 'eslint-plugin-bpmn-io';

const files = {
  build: [
    '*.js',
    '*.mjs'
  ],
  lib: [
    'lib/**/*.js'
  ],
  ignored: [
    'coverage'
  ]
};


export default [
  {
    ignores: files.ignored
  },

  // build + lib (node)
  ...bpmnIoPlugin.configs.node.map(config => {
    return {
      ...config,
      files: [ ...files.build, ...files.lib ]
    };
  })
];

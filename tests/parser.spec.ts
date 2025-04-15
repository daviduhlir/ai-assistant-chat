import { expect } from 'chai';
import { FunctionUtils } from '../lib/utils/functions';

describe('Parser', () => {
  it('should parse a complex method call with a multi-line string parameter', () => {
    const content = `
    import { Interaction, validateKeyValueFieldMapper } from '@zenoo/hub-design-studio-core/common'
import { includeLibraryFile } from 'library-utils'

import icons from '../icons'
import Node from './Node' //'@zenoo-libraries/common/Node'
import Settings from './Settings'

const TestInteraction: Interaction = {
  author: 'Zenoo',
  type: 'default',
  name: 'TestInteraction',
  displayName: 'Test interaction (debug)',
  description: 'Interaction to test new features (debug)',
  icon: icons.empty,
  category: 'Testing',
  canTerminate: true,
  inputConnector: {
    name: 'default',
  },
  outputConnectors: [
    {
      name: 'default',
    },
  ],
  targetFactory: [
    {
      action: 'render',
      targetFilename: 'pages/{%- attributes.uri %}-{%- token %}.yml',
      source: includeLibraryFile('./target/page.yml'),
    },
    {
      action: 'add-page',
      targetFilename: 'pages/{%- attributes.uri %}-{%- token %}.yml',
      uri: '{%- attributes.uri %}',
      stepName: '{%- attributes.stepName %}',
    },
    {
      action: 'render',
      targetFilename: 'styles/{%- attributes.uri %}-{%- token %}.less',
      source: includeLibraryFile('./target/style.less'),
    },
  ],
  workflowFactory: {
    main: includeLibraryFile('./workflow/main.wf'),
  },
  validate: [validateKeyValueFieldMapper('dataFields')],
  renderNode: Node,
  renderEditor: Settings,
  initialData: {
    attributes: {
      uri: 'test-interaction',
      name: 'Test interaction',
    },
  },
}

export default TestInteraction
    `

    const input = `writeFile("src/interactions/TestInteraction/index.ts", \`${content}\`)`;

    const result = FunctionUtils.parseMethodCall(input);

    expect(result).to.deep.equal({
      call: 'writeFile',
      parameters: [
        'src/interactions/TestInteraction/index.ts',
        `${content}`,
      ],
    });
  });
});

import { pathToFileURL } from 'node:url';
import { createBusinessProfilePolicy, runBusinessProfileCli } from './ci-source-policy.mjs';
export const {
  productSources,
  matchesProductSource,
  selectBusinessProfileLane,
  validateBusinessProfileGroup,
} = createBusinessProfilePolicy('dsh-agent-workbench');
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  runBusinessProfileCli('dsh-agent-workbench', createBusinessProfilePolicy('dsh-agent-workbench'));

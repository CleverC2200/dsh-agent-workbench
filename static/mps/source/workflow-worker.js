import { buildMpsWorkflow } from './workflow-inputs.js';

self.onmessage = ({ data }) => {
  try {
    const result = buildMpsWorkflow(data.draft, data.relations, data.shipment, data.evaluation);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

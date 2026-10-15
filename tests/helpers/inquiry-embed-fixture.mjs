import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const daytona = 'Kid City USA - FL | Daytona Beach East';
const douglas = 'Kid City USA - FL | Altamonte - Douglas';
export async function embedFixture(script, { dataset = {}, fields = {}, eligibility = true, loadFails = false, responseOk = true, omitEligibility = false } = {}) {
  const calls = [];
  let submitHandler;
  const status = { textContent: '', dataset: {}, removeAttribute() {} };
  const button = { disabled: false, textContent: 'Submit inquiry' };
  const values = { parentName: 'Synthetic Fixture', email: 'fixture@example.invalid', phone: '2025550100', program: 'Daycare', locationId: douglas, ...fields };
  const selected = { dataset: { locationName: values.locationName || values.locationId, locationId: values.publicLocationId || values.locationId, centerId: values.centerId || '' } };
  const form = { checkValidity: () => true, reportValidity() {}, reset() {}, querySelector: () => selected, addEventListener: (_event, handler) => { submitHandler = handler; } };
  const target = { innerHTML: '', querySelector: (selector) => selector === 'form' ? form : selector === 'button' ? button : status };
  const document = {
    currentScript: { src: 'https://fixture.invalid/' + script, dataset: { preset: 'kidcity', ...dataset } },
    getElementById: () => target, createElement: () => ({}), head: { appendChild() {} }, querySelector: () => null,
  };
  const window = { location: { href: 'https://example.invalid/daycare/' } };
  vm.runInNewContext(readFileSync('public/' + script, 'utf8'), {
    document, window, URL,
    FormData: class { get(key) { return values[key] || ''; } },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (options?.method === 'POST') return { ok: true };
      if (loadFails) throw new Error('synthetic catalog outage');
      return { ok: responseOk, json: async () => ({ ...(omitEligibility ? {} : { inquiryCenterEligible: eligibility }),
        locations: [daytona, douglas].map((id) => ({ crmLocationId: id, locationId: id, name: id, state: 'FL' })) }) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { target, status, button, calls,
    submit: async () => { if (!submitHandler) throw new Error('No rendered form'); await submitHandler({ preventDefault() {} }); },
  };
}

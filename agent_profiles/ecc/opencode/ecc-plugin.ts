import ECCPlugin from "ecc-universal";

export default async (input) => {
  const hooks = await ECCPlugin(input);
  // Upstream auto-approval bypasses normal read and shell approval gates.
  delete hooks["permission.ask"];
  return hooks;
};

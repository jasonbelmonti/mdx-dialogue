export function validateRelease(
  manifest: {
    name: string;
    private?: boolean;
    version: string;
    license: string;
    publishConfig?: { access?: string; tag?: string; registry?: string };
  },
  plugin: { version: string },
  canvas: { version: string },
  licenseText: string,
  tag?: string,
): void;

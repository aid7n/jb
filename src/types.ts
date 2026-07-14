export type YarnInfoLine = {
  value: string;
  children: {
    Instances?: number;
    Version: string;
    Dependencies?: {
      descriptor: string;
      locator: string;
    }[];
    "Exported Binaries"?: string[];
  };
};

export type BunBins<
  Name extends string = string,
  Path extends string = string,
> = Record<Name, Path>;

export type BunPkgsWithVersion<
  Name extends string = string,
  Version extends string = string,
> = Record<Name, Version>;

export type BunTrustedDependencies = string[];

export type BunCatalog = BunPkgsWithVersion;

export type BunWorkspace<
  Name extends string = string,
  Version extends string = string,
> = {
  name: Name;
  version?: Version;
  dependencies?: BunPkgsWithVersion;
  devDependencies?: BunPkgsWithVersion;
  peerDependencies?: BunPkgsWithVersion;
};

export type BunPackage<
  Name extends string = string,
  Version extends string = string,
  RegistryURI extends string = string,
  SHA512 extends string = string,
> = [
  `${Name}@${Version}`,
  RegistryURI | undefined,
  (
    | {
        dependencies?: BunPkgsWithVersion;
        peerDependencies?: BunPkgsWithVersion;
        optionalPeers?: string[];
        bin?: BunBins;
      }
    | undefined
  ),
  SHA512 | undefined,
];

export type BunPackages<
  Name extends string = string,
  Version extends string = string,
  RegistryURI extends string = string,
  SHA512 extends string = string,
> = Record<Name, BunPackage<Name, Version, RegistryURI, SHA512>>;

export interface BunLock {
  lockfileVersion: number;
  configVersion: number;
  workspaces: Record<string, BunWorkspace>;
  trustedDependencies: BunTrustedDependencies;
  catalog: BunCatalog;
  packages: BunPackages;
}

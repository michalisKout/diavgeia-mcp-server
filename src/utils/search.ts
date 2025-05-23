import Fuse from "fuse.js";

export const createSearchInstance = <D>(data: readonly D[], keys: string[]) => {
  return new Fuse<D>(data, {
    keys,
  });
};

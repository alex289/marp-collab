import { Marp } from "@marp-team/marp-core";

const marp = new Marp({
  html: true,
});

export const renderMarp = (markdown: string) => {
  return marp.render(markdown);
};

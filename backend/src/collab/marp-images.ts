import { Marp } from "@marp-team/marp-core";
import { MARP_IMAGE_RULE, rewriteMarpImages } from "../../../shared/marp-dialect.ts";

export function createMarpWithImageRewriter(
	rewrite: (src: string) => string,
	options?: ConstructorParameters<typeof Marp>[0],
) {
	const marp = new Marp({
		...options,
		html: {
			...Marp.html,
			img: {
				...(Marp.html.img as Record<string, boolean>),
				src: rewrite,
			},
		},
	});
	marp.use((md) => {
		md.inline.ruler2.after(MARP_IMAGE_RULE, "rewrite_image_urls", rewriteMarpImages(rewrite));
	});
	return marp;
}

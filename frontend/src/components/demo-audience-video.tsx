import { useEffect, useState } from "react";
import { connectDemoAudience } from "@/lib/demo-share";

export function DemoAudienceVideo({ deck, blanked }: { deck: string; blanked: boolean }) {
	const [stream, setStream] = useState<MediaStream | null>(null);
	useEffect(() => connectDemoAudience(deck, setStream), [deck]);

	if (!stream) {
		return null;
	}

	return (
		<video
			ref={(video) => {
				if (video && video.srcObject !== stream) {
					video.srcObject = stream;
				}
			}}
			aria-label="Shared live demo"
			hidden={blanked}
			autoPlay
			muted
			playsInline
			className="absolute inset-0 z-40 h-full w-full bg-black object-contain"
		/>
	);
}

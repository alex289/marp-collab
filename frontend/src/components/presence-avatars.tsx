import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness.js";
import {
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getInitials } from "@/lib/utils";

type Participant = {
	id: string;
	name: string;
	color: string;
	image: string | null;
};

const MAX_VISIBLE_PARTICIPANTS = 4;

export const PresenceAvatars = ({ awareness }: { awareness: Awareness | null }) => {
	const [participants, setParticipants] = useState<Participant[]>([]);

	useEffect(() => {
		if (!awareness) {
			setParticipants([]);
			return;
		}

		const update = () => {
			const byId = new Map<string, Participant>();

			for (const state of awareness.getStates().values()) {
				const user = state.user as Partial<Participant> | undefined;
				if (!user) {
					continue;
				}

				const id = user.id ?? crypto.randomUUID();
				byId.set(id, {
					id,
					name: user.name ?? "Unknown",
					color: user.color ?? "#0ea5e9",
					image: user.image ?? null,
				});
			}

			setParticipants(Array.from(byId.values()));
		};

		update();
		awareness.on("change", update);

		return () => {
			awareness.off("change", update);
		};
	}, [awareness]);

	if (participants.length === 0) {
		return null;
	}

	const visibleParticipants = participants.slice(0, MAX_VISIBLE_PARTICIPANTS);
	const hiddenParticipants = Math.max(0, participants.length - visibleParticipants.length);
	const label = `${participants.length} online`;

	return (
		<AvatarGroup className="mr-1" aria-label={label} title={label}>
			{visibleParticipants.map((participant) => (
				<TooltipProvider key={participant.id}>
					<Tooltip>
						<TooltipTrigger
							render={
								<Avatar size="sm" className="ring-1 ring-background after:border-0">
									{participant.image ? (
										<AvatarImage src={participant.image} alt={participant.name} />
									) : null}
									<AvatarFallback
										className="text-white"
										style={{ backgroundColor: participant.color }}
									>
										{getInitials(participant.name)}
									</AvatarFallback>
								</Avatar>
							}
						/>
						<TooltipContent>{participant.name}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			))}
			{hiddenParticipants > 0 ? <AvatarGroupCount>+{hiddenParticipants}</AvatarGroupCount> : null}
		</AvatarGroup>
	);
};

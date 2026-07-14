import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "./ui/kbd";

export function ModeToggle() {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" size="icon" aria-label="Switch theme">
									<Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
									<Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
								</Button>
							}
						/>
					}
				/>
				<TooltipContent>
					Switch theme
					<Kbd>D</Kbd>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

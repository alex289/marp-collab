import { LoginScreen } from "@/components/login-screen";
import { useSession } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/types";
import { LoadingScreen } from "./components/loading-screen";
import { MainScreen } from "./components/main-screen";

type SessionPayload = {
	user?: SessionUser;
};

const App = () => {
	const { data, isPending } = useSession();
	const session = data as SessionPayload | null;
	const sessionUser = session?.user ?? null;

	if (isPending) {
		return <LoadingScreen />;
	}

	if (!sessionUser) {
		return <LoginScreen />;
	}

	return <MainScreen sessionUser={sessionUser} />;
};

export default App;

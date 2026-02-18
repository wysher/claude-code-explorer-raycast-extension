import {
  List,
  ActionPanel,
  Action,
  Detail,
  LocalStorage,
  showHUD,
  Icon,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState, useEffect, useRef } from "react";
import {
  loadHistoryEntries,
  getUniqueProjects,
  buildSessions,
  loadConversation,
  formatMessagesAsMarkdown,
  getProjectName,
} from "./lib/history";
import { formatRelativeTime, extractTextContent, isToolResultOnly } from "./lib/utils";
import type { Session, SortOrder } from "./lib/types";

const LAST_PROJECT_KEY = "browse-history-last-project";
const SORT_ORDER_KEY = "browse-history-sort-order";
const ALL_PROJECTS = "__all__";
const DEBOUNCE_MS = 150;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);

  return debounced;
}

function useConversationMarkdown(session: Session, enabled: boolean) {
  const { data: messages, isLoading } = useCachedPromise(
    loadConversation,
    [session],
    { execute: enabled },
  );
  const markdown = messages ? formatMessagesAsMarkdown(messages) : "";
  return { markdown, isLoading };
}

function SessionActions({
  session,
  sortOrder,
  onToggleSort,
  firstPrompt,
  lastPrompt,
}: {
  session: Session;
  sortOrder?: SortOrder;
  onToggleSort?: () => void;
  firstPrompt?: string;
  lastPrompt?: string;
}) {
  return (
    <ActionPanel>
      <Action.Push
        title="View Full Conversation"
        icon={Icon.Eye}
        target={<FullConversation session={session} />}
      />
      {sortOrder && onToggleSort && (
        <Action
          title={sortOrder === "recent" ? "Sort by Created" : "Sort by Recent"}
          icon={Icon.ArrowsContract}
          shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
          onAction={onToggleSort}
        />
      )}
      {firstPrompt && (
        <Action.CopyToClipboard
          title="Copy First Prompt"
          content={firstPrompt}
          shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
        />
      )}
      {lastPrompt && (
        <Action.CopyToClipboard
          title="Copy Last Prompt"
          content={lastPrompt}
          shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
        />
      )}
      <Action.CopyToClipboard
        title="Copy Resume Command (skip Permissions)"
        content={`claude --dangerously-skip-permissions --resume ${session.id}`}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        onCopy={() => showHUD("Copied resume command")}
      />
      <Action.CopyToClipboard
        title="Copy Resume Command"
        content={`claude --resume ${session.id}`}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onCopy={() => showHUD("Copied resume command")}
      />
      <Action.CopyToClipboard
        title="Copy Session Id"
        content={session.id}
        shortcut={{ modifiers: ["cmd"], key: "." }}
      />
    </ActionPanel>
  );
}

function SessionItem({
  session,
  active,
  sortOrder,
  onToggleSort,
  showProjectName,
}: {
  session: Session;
  active: boolean;
  sortOrder: SortOrder;
  onToggleSort: () => void;
  showProjectName: boolean;
}) {
  const { data: messages, isLoading } = useCachedPromise(
    loadConversation,
    [session],
    { execute: active },
  );
  const markdown = messages ? formatMessagesAsMarkdown(messages) : "";

  const userMessages = (messages ?? []).filter(
    (m) => m.type === "user" && m.message && !isToolResultOnly(m.message.content),
  );
  const firstPrompt = userMessages.length > 0 ? extractTextContent(userMessages[0].message.content) : undefined;
  const lastPrompt = userMessages.length > 1 ? extractTextContent(userMessages[userMessages.length - 1].message.content) : undefined;

  const date = new Date(
    sortOrder === "recent" ? session.lastActiveAt : session.timestamp,
  );

  return (
    <List.Item
      id={session.id}
      title={session.display || `[${date.toLocaleString()}]`}
      subtitle={showProjectName ? session.projectName : undefined}
      accessories={[{ text: formatRelativeTime(date), tooltip: date.toLocaleString() }]}
      detail={<List.Item.Detail isLoading={active && isLoading} markdown={markdown} />}
      actions={
        <SessionActions
          session={session}
          sortOrder={sortOrder}
          onToggleSort={onToggleSort}
          firstPrompt={firstPrompt}
          lastPrompt={lastPrompt}
        />
      }
    />
  );
}

function FullConversation({ session }: { session: Session }) {
  const { markdown, isLoading } = useConversationMarkdown(session, true);
  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={session.display}
      actions={<SessionActions session={session} />}
    />
  );
}

function sortSessions(sessions: Session[], order: SortOrder): Session[] {
  const key = order === "recent" ? "lastActiveAt" : "timestamp";
  return [...sessions].sort((a, b) => b[key] - a[key]);
}

export default function Command() {
  const { data: entries, isLoading: loadingEntries } =
    useCachedPromise(loadHistoryEntries);
  const [selectedProject, setSelectedProject] = useState<string>(ALL_PROJECTS);
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [loaded, setLoaded] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(searchText, DEBOUNCE_MS);
  const debouncedSelectedId = useDebouncedValue(selectedId, DEBOUNCE_MS);

  useEffect(() => {
    Promise.all([
      LocalStorage.getItem<string>(LAST_PROJECT_KEY),
      LocalStorage.getItem<string>(SORT_ORDER_KEY),
    ]).then(([savedProject, savedSort]) => {
      if (savedProject) setSelectedProject(savedProject);
      if (savedSort === "recent" || savedSort === "created")
        setSortOrder(savedSort);
      setLoaded(true);
    });
  }, []);

  const projects = entries ? getUniqueProjects(entries) : [];
  const sessions = entries ? buildSessions(entries) : [];
  const projectFiltered =
    selectedProject === ALL_PROJECTS
      ? sessions
      : sessions.filter((s) => s.project === selectedProject);
  const sorted = sortSessions(projectFiltered, sortOrder);

  const filtered = debouncedSearch
    ? sorted.filter((s) => {
        const q = debouncedSearch.toLowerCase();
        return (
          s.display?.toLowerCase().includes(q) ||
          s.projectName?.toLowerCase().includes(q)
        );
      })
    : sorted;

  function handleProjectChange(value: string) {
    setSelectedProject(value);
    LocalStorage.setItem(LAST_PROJECT_KEY, value);
  }

  function toggleSort() {
    const next = sortOrder === "recent" ? "created" : "recent";
    setSortOrder(next);
    LocalStorage.setItem(SORT_ORDER_KEY, next);
  }

  return (
    <List
      isLoading={loadingEntries || !loaded}
      isShowingDetail
      filtering={false}
      onSearchTextChange={setSearchText}
      throttle
      onSelectionChange={setSelectedId}
      searchBarPlaceholder="Search history..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select Project"
          value={selectedProject}
          onChange={handleProjectChange}
        >
          <List.Dropdown.Item title="All Projects" value={ALL_PROJECTS} />
          <List.Dropdown.Section title="Projects">
            {projects.map((p) => (
              <List.Dropdown.Item key={p} title={getProjectName(p)} value={p} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {filtered.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          active={debouncedSelectedId === session.id}
          sortOrder={sortOrder}
          onToggleSort={toggleSort}
          showProjectName={selectedProject === ALL_PROJECTS}
        />
      ))}
    </List>
  );
}

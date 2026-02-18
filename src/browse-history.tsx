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
import { useState, useEffect } from "react";
import {
  loadHistoryEntries,
  getUniqueProjects,
  buildSessions,
  loadConversation,
  formatMessagesAsMarkdown,
  getProjectName,
} from "./lib/history";
import { formatRelativeTime } from "./lib/utils";
import type { Session, SortOrder } from "./lib/types";

const LAST_PROJECT_KEY = "browse-history-last-project";
const SORT_ORDER_KEY = "browse-history-sort-order";
const ALL_PROJECTS = "__all__";

function useConversationMarkdown(session: Session) {
  const { data: messages, isLoading } = useCachedPromise(loadConversation, [
    session,
  ]);
  const markdown = messages ? formatMessagesAsMarkdown(messages) : "";
  return { markdown, isLoading };
}

function SessionActions({
  session,
  sortOrder,
  onToggleSort,
}: {
  session: Session;
  sortOrder: SortOrder;
  onToggleSort: () => void;
}) {
  return (
    <ActionPanel>
      <Action.Push
        title="View Full Conversation"
        icon={Icon.Eye}
        target={<FullConversation session={session} />}
      />
      <Action
        title={sortOrder === "recent" ? "Sort by Created" : "Sort by Recent"}
        icon={Icon.ArrowsContract}
        shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
        onAction={onToggleSort}
      />
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

function SessionDetail({ session }: { session: Session }) {
  const { markdown, isLoading } = useConversationMarkdown(session);
  return <List.Item.Detail isLoading={isLoading} markdown={markdown} />;
}

function FullConversation({ session }: { session: Session }) {
  const { markdown, isLoading } = useConversationMarkdown(session);
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
  const filtered =
    selectedProject === ALL_PROJECTS
      ? sessions
      : sessions.filter((s) => s.project === selectedProject);
  const sorted = sortSessions(filtered, sortOrder);

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
      {sorted.map((session) => {
        const date = new Date(
          sortOrder === "recent" ? session.lastActiveAt : session.timestamp,
        );
        return (
          <List.Item
            key={session.id}
            title={session.display || `[${date.toLocaleString()}]`}
            subtitle={selectedProject === ALL_PROJECTS ? session.projectName : undefined}
            accessories={[
              {
                text: formatRelativeTime(date),
                tooltip: date.toLocaleString(),
              },
            ]}
            detail={<SessionDetail session={session} />}
            actions={
              <SessionActions
                session={session}
                sortOrder={sortOrder}
                onToggleSort={toggleSort}
              />
            }
          />
        );
      })}
    </List>
  );
}

"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import ChecklistApp from "./checklist-app.jsx";
import AccountPassword from "./account-password.jsx";
import { authClient } from "../lib/auth-client.mjs";
import { api } from "../lib/api-client.mjs";
import { validateWorkspace, mergeLocalWorkspace } from "../lib/workspace.mjs";
import { loadCategoryGalleries } from "../lib/category-gallery.mjs";

const LOCAL = "your-check-list-ai-v1";
function download(value, name = "your-checklist-backup.json") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      const result = register
        ? await authClient.signUp.email({
            name: String(values.get("name")).trim(),
            email: String(values.get("email")).trim(),
            password: String(values.get("password")),
          })
        : await authClient.signIn.email({
            email: String(values.get("email")).trim(),
            password: String(values.get("password")),
          });
      if (result.error)
        throw new Error(
          register
            ? "Não foi possível criar a conta. Confira os dados ou tente entrar."
            : "E-mail ou senha incorretos.",
        );
    } catch (e) {
      setError(e.message || "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="qc-account-page">
      <section className="qc-account-card">
        <span className="qc-logo">✓</span>
        <div className="qc-eyebrow">YOUR CHECKLIST</div>
        <h1>
          {register
            ? "Comece seu próximo plano."
            : "Seus planos, em qualquer lugar."}
        </h1>
        <p>Organize compras, referências e orçamento em um só espaço.</p>
        <form onSubmit={submit}>
          {register && (
            <label className="qc-field">
              <span>Seu nome</span>
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          )}
          <label className="qc-field">
            <span>E-mail</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label className="qc-field">
            <span>Senha {register ? "(mínimo de 10 caracteres)" : ""}</span>
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 10 : 1}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="qc-error" role="alert">
              {error}
            </p>
          )}
          <button className="qc-button qc-primary" disabled={busy}>
            {busy ? "Conectando…" : register ? "Criar minha conta" : "Entrar"}
          </button>
        </form>
        <button
          className="qc-text-button"
          disabled={busy}
          onClick={() => {
            setRegister((v) => !v);
            setError("");
          }}
        >
          {register ? "Já tenho conta" : "Criar uma conta"}
        </button>
      </section>
    </main>
  );
}
function CloudWorkspace({ session }) {
  const [state, setState] = useState({
      data: null,
      nonce: 0,
      status: "loading",
      error: "",
    }),
    [local, setLocal] = useState(null),
    [migration, setMigration] = useState(""),
    [recovery, setRecovery] = useState(null);
  const backupFile = useRef(null);
  const cacheKey = `your-checklist-pending-${session.user.id}`,
    draft = useRef(null),
    saved = useRef(""),
    revision = useRef(0),
    flight = useRef(null),
    blocked = useRef(false),
    timer = useRef(null),
    mounted = useRef(true);
  const status = useCallback((value, error = "") => {
    if (mounted.current) setState((s) => ({ ...s, status: value, error }));
  }, []);
  const commit = useCallback(
    (result, remount = false) => {
      draft.current = result.data;
      saved.current = JSON.stringify(result.data);
      revision.current = result.revision;
      blocked.current = false;
      try {
        localStorage.removeItem(cacheKey);
      } catch {}
      setState((s) => ({
        ...s,
        data: result.data,
        nonce: s.nonce + (remount ? 1 : 0),
        status: "saved",
        error: "",
      }));
    },
    [cacheKey],
  );
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (flight.current) {
      await flight.current;
      return flush();
    }
    if (blocked.current)
      throw new Error("Recarregue a versão da nuvem antes de continuar.");
    if (!draft.current || JSON.stringify(draft.current) === saved.current)
      return;
    const data = draft.current,
      snapshot = JSON.stringify(data);
    status("saving");
    const request = api("/api/workspace", {
      method: "PUT",
      body: JSON.stringify({ data, revision: revision.current }),
    })
      .then((result) => {
        revision.current = result.revision;
        saved.current = snapshot;
        if (JSON.stringify(draft.current) === snapshot) {
          try {
            localStorage.removeItem(cacheKey);
          } catch {}
          status("saved");
        } else {
          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({
                data: draft.current,
                revision: revision.current,
              }),
            );
          } catch {}
        }
      })
      .catch((e) => {
        if (e.status === 409) {
          blocked.current = true;
          status("conflict", e.message);
        } else status("error", e.message);
        throw e;
      })
      .finally(() => {
        flight.current = null;
      });
    flight.current = request;
    await request;
    if (JSON.stringify(draft.current) !== saved.current) return flush();
  }, [cacheKey, status]);
  const onChange = useCallback(
    (data) => {
      draft.current = data;
      if (JSON.stringify(data) === saved.current) return;
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ data, revision: revision.current }),
        );
      } catch {}
      if (!blocked.current) {
        status("pending");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush().catch(() => {}), 500);
      }
    },
    [cacheKey, flush, status],
  );
  useEffect(() => {
    mounted.current = true;
    let active = true;
    api("/api/workspace")
      .then((result) => {
        if (!active) return;
        let pending;
        try {
          pending = JSON.parse(localStorage.getItem(cacheKey) || "null");
        } catch {}
        commit(result);
        if (pending) {
          setRecovery(pending);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(pending));
          } catch {}
        }
        try {
          const raw = JSON.parse(localStorage.getItem(LOCAL) || "null");
          if (raw?.projects?.length) setLocal(validateWorkspace(raw));
        } catch {}
      })
      .catch((e) => status("error", e.message));
    return () => {
      active = false;
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, [cacheKey, commit, status]);
  useEffect(() => {
    const unload = (e) => {
      if (draft.current && JSON.stringify(draft.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const online = () => flush().catch(() => {});
    const focus = async () => {
      if (
        !draft.current ||
        blocked.current ||
        flight.current ||
        JSON.stringify(draft.current) !== saved.current
      )
        return;
      try {
        const result = await api("/api/workspace");
        if (
          result.revision !== revision.current ||
          JSON.stringify(result.data) !== saved.current
        )
          commit(result, true);
      } catch {}
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("online", online);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", focus);
    };
  }, [flush, commit]);
  async function refresh() {
    if (!blocked.current && JSON.stringify(draft.current) !== saved.current)
      throw new Error(
        "Há alterações pendentes. Tente salvar antes de recarregar.",
      );
    const result = await api("/api/workspace");
    commit(result, true);
  }
  async function manage(projectId, operation) {
    await flush();
    const result = await api("/api/structure", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        operation,
        revision: revision.current,
      }),
    });
    commit(result);
    return result.data;
  }
  async function migrate() {
    setMigration("Importando seus dados e referências…");
    try {
      await flush();
      let id = localStorage.getItem(`qc-migration-${session.user.id}`);
      if (!id) {
        id = crypto.randomUUID().slice(0, 12);
        localStorage.setItem(`qc-migration-${session.user.id}`, id);
      }
      const data = mergeLocalWorkspace(draft.current, local, id);
      onChange(data);
      await flush();
      commit({ data, revision: revision.current }, true);
      for (const project of local.projects) {
        const projectId = `m-${id}-${project.id}`.slice(0, 100);
        const records = await loadCategoryGalleries(project.id);
        for (const record of records) {
          await api("/api/galleries", {
            method: "POST",
            body: JSON.stringify({
              projectId,
              category: record.category,
              action: { type: "create" },
            }),
          });
          for (const photo of record.photos)
            await api("/api/galleries", {
              method: "POST",
              body: JSON.stringify({
                projectId,
                category: record.category,
                action: { type: "add", photos: [photo] },
              }),
            });
        }
      }
      setMigration(
        "Dados e referências importados. A cópia original continua neste navegador.",
      );
      setLocal(null);
      setState((s) => ({ ...s, nonce: s.nonce + 1 }));
    } catch (e) {
      setMigration(
        "A importação não terminou: " +
          e.message +
          " Tente novamente; os registros já importados serão reconhecidos.",
      );
    }
  }
  async function importBackup(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Use uma cópia de até 10 MB.");
      const text = await file.text(),
        source = validateWorkspace(JSON.parse(text));
      if (
        !window.confirm(
          `Importar ${source.projects.length} projetos desta cópia? Eles serão adicionados sem substituir os atuais. A cópia de dados não inclui imagens de referência.`,
        )
      )
        return;
      await flush();
      const hash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(text),
        ),
        id = Array.from(new Uint8Array(hash))
          .slice(0, 6)
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      const data = mergeLocalWorkspace(draft.current, source, id);
      onChange(data);
      await flush();
      commit({ data, revision: revision.current }, true);
    } catch (e) {
      status("error", "Não foi possível importar a cópia: " + e.message);
    }
  }
  async function logout() {
    try {
      await flush();
      await authClient.signOut();
    } catch (e) {
      status("error", "Não foi possível sair com segurança: " + e.message);
    }
  }
  const labels = {
    loading: "Carregando…",
    saved: "Salvo na sua conta",
    pending: "Alterações pendentes",
    saving: "Salvando…",
    error: "Não foi possível salvar",
    conflict: "Conflito entre dispositivos",
  };
  return (
    <>
      <div className="qc-account-bar">
        <span>
          {session.user.name} · {labels[state.status]}
        </span>
        <div>
          <button
            className="qc-text-button"
            disabled={!state.data}
            onClick={() => download(draft.current)}
          >
            Backup dos dados
          </button>
          <button
            className="qc-text-button"
            onClick={() => refresh().catch((e) => status("error", e.message))}
          >
            Atualizar
          </button>
          <button
            className="qc-text-button"
            onClick={() => backupFile.current?.click()}
          >
            Importar backup
          </button>
          <input
            ref={backupFile}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Arquivo de backup"
            onChange={importBackup}
          />
          <AccountPassword />
          <button className="qc-text-button" onClick={logout}>
            Sair
          </button>
        </div>
      </div>
      {state.error && (
        <div className="qc-sync-alert" role="alert">
          <span>{state.error}</span>
          {state.status === "conflict" ? (
            <>
              <button
                className="qc-button"
                onClick={() =>
                  download(
                    draft.current,
                    "your-checklist-alteracoes-locais.json",
                  )
                }
              >
                Baixar minhas alterações
              </button>
              <button
                className="qc-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Carregar a versão da nuvem? Baixe suas alterações locais antes de continuar.",
                    )
                  )
                    refresh().catch((e) => status("error", e.message));
                }}
              >
                Carregar versão da nuvem
              </button>
            </>
          ) : (
            <button
              className="qc-button"
              onClick={() =>
                state.data ? flush().catch(() => {}) : location.reload()
              }
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}
      {recovery && (
        <div className="qc-sync-alert">
          <span>Encontramos alterações que não foram salvas nesta conta.</span>
          <button
            className="qc-button"
            onClick={() =>
              download(recovery.data, "your-checklist-recuperacao.json")
            }
          >
            Baixar cópia
          </button>
          <button
            className="qc-button"
            disabled={recovery.revision !== revision.current}
            onClick={() => {
              onChange(recovery.data);
              setState((s) => ({
                ...s,
                data: recovery.data,
                nonce: s.nonce + 1,
              }));
              setRecovery(null);
              flush().catch(() => {});
            }}
          >
            Restaurar alterações
          </button>
          <button
            className="qc-button"
            onClick={() => {
              if (window.confirm("Descartar esta cópia de recuperação?")) {
                try {
                  localStorage.removeItem(cacheKey);
                } catch {}
                setRecovery(null);
              }
            }}
          >
            Descartar cópia
          </button>
          {recovery.revision !== revision.current && (
            <small>
              A nuvem recebeu alterações mais recentes. Baixe a cópia para
              preservar seu trabalho.
            </small>
          )}
        </div>
      )}
      {local && (
        <div className="qc-migration">
          <span>Você tem checklists salvos neste navegador.</span>
          <button
            className="qc-button"
            disabled={migration.startsWith("Importando")}
            onClick={migrate}
          >
            Importar para minha conta
          </button>
        </div>
      )}
      {migration && (
        <p className="qc-migration" role="status">
          {migration}
        </p>
      )}
      {state.data && !recovery ? (
        <ChecklistApp
          key={state.nonce}
          initialData={state.data}
          onDataChange={onChange}
          cloud={{ flush, manage }}
        />
      ) : (
        <main className="qc-account-page">
          <p role="status">Carregando seus checklists…</p>
        </main>
      )}
    </>
  );
}
function Connected() {
  const { data: session, isPending } = authClient.useSession();
  return isPending ? (
    <main className="qc-account-page">
      <p role="status">Carregando sua conta…</p>
    </main>
  ) : session ? (
    <CloudWorkspace key={session.user.id} session={session} />
  ) : (
    <Login />
  );
}
export default function AccountShell({ configured }) {
  return configured ? (
    <Connected />
  ) : (
    <>
      <div className="qc-account-bar">
        <span>Modo local · dados salvos somente neste navegador</span>
        <span>Contas e sincronização aguardam configuração.</span>
      </div>
      <ChecklistApp />
    </>
  );
}

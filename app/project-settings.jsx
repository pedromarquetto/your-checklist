"use client";
import React, { useState } from "react";
function RenameRow({ kind, name, onAction, busy }) {
  return (
    <form
      className="qc-manage-row"
      onSubmit={(event) => {
        event.preventDefault();
        onAction({
          kind,
          oldName: name,
          name: String(new FormData(event.currentTarget).get("name")).trim(),
          remove: false,
        });
      }}
    >
      <input
        aria-label={`Nome de ${name}`}
        name="name"
        defaultValue={name}
        maxLength={80}
        required
      />
      <button className="qc-button" disabled={busy}>
        Renomear
      </button>
      <button
        type="button"
        className="qc-button qc-danger"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Excluir ${name}? Os itens, compras e ofertas vinculados serão removidos. A galeria também será removida ao excluir uma categoria ou projeto.`,
            )
          )
            onAction({ kind, oldName: name, remove: true });
        }}
      >
        Excluir
      </button>
    </form>
  );
}
export default function ProjectSettings({
  project,
  rooms,
  categories,
  onAction,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(operation) {
    setBusy(true);
    setError("");
    try {
      await onAction(operation);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="qc-manage">
      <p>
        Organize os nomes do projeto. Excluir um ambiente ou categoria também
        remove seus itens e registros de compra.
      </p>
      {error && (
        <p className="qc-error" role="alert">
          {error}
        </p>
      )}
      <h3>Projeto</h3>
      <RenameRow
        key={project.name}
        kind="project"
        name={project.name}
        busy={busy}
        onAction={act}
      />
      <h3>Ambientes</h3>
      {rooms.length ? (
        rooms.map((name) => (
          <RenameRow
            key={name}
            kind="room"
            name={name}
            busy={busy}
            onAction={act}
          />
        ))
      ) : (
        <p>Nenhum ambiente cadastrado.</p>
      )}
      <h3>Categorias</h3>
      {categories.length ? (
        categories.map((name) => (
          <RenameRow
            key={name}
            kind="category"
            name={name}
            busy={busy}
            onAction={act}
          />
        ))
      ) : (
        <p>Crie categorias nos itens ou em Galerias.</p>
      )}
    </div>
  );
}

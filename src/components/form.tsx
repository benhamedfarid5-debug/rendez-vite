import React from 'react';

/**
 * Formulaire compatible avec les environnements d'aperçu intégrés.
 *
 * Certains cadres (`<iframe sandbox>` sans `allow-forms`) bloquent la
 * soumission native des formulaires : l'événement `submit` n'est jamais émis et
 * le bouton ne fait rien. On conserve l'élément `<form>` (sémantique, labels,
 * autocomplétion) mais :
 *  - `onSubmit` est appelé depuis un bouton `type="button"` (voir SubmitButton) ;
 *  - la touche Entrée est interceptée au niveau du formulaire.
 * Résultat identique pour l'utilisateur, y compris au clavier.
 */
export function Form({
  onSubmit,
  children,
  className,
  ...rest
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit: (event: React.FormEvent<HTMLFormElement> | React.SyntheticEvent) => void;
}) {
  const submit = (event: React.SyntheticEvent) => {
    event.preventDefault();
    onSubmit(event);
  };

  return (
    <form
      {...rest}
      className={className}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        const target = event.target as HTMLElement;
        // Une zone de texte multiligne garde le comportement naturel.
        if (target?.tagName === 'TEXTAREA') return;
        submit(event);
      }}
    >
      {children}
    </form>
  );
}

/** Bouton de soumission qui fonctionne aussi dans un cadre sandboxé. */
export function SubmitButton({
  onClick,
  children,
  className = 'btn-primary',
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" {...rest} disabled={disabled} className={className} onClick={onClick}>
      {children}
    </button>
  );
}

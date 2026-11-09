import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { EmptyState } from '../components/ui';
import { IconAlert } from '../components/icons';

export function NotFound() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<IconAlert size={26} />}
      title="404"
      description={t('errorNotFound')}
      action={
        <Link to="/" className="btn-primary btn-sm">
          {t('navHome')}
        </Link>
      }
    />
  );
}

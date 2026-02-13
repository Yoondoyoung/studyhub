export const getMedalEmoji = (medal: string | null | undefined): string => {
  if (!medal) return '';
  switch (medal) {
    case 'bronze':
      return '🥉';
    case 'silver':
      return '🥈';
    case 'gold':
      return '🥇';
    default:
      return '';
  }
};

export const MedalBadge = ({ medal }: { medal: string | null | undefined }) => {
  const emoji = getMedalEmoji(medal);
  if (!emoji) return null;
  
  return (
    <span className="text-sm" title={`${medal} medal`}>
      {emoji}
    </span>
  );
};

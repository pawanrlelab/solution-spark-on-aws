import { Box } from '@awsui/components-react';

/**
 * Displays the empty state of any table
 * @param itemType - type of item that the table displays
 * @example
 * ```
 * <Table empty={ TableEmptyDisplay("cluster") } />
 * // Displays "No clusters" title
 * // "No clusters to display."
 * ```
 * @returns empty table information
 */
export function TableEmptyDisplay(itemType: string): JSX.Element {
  return (
    <Box textAlign="center" color="inherit">
      <b>No {itemType}s</b>
      <Box padding={{ bottom: 's' }} variant="p" color="inherit">
        No {itemType}s to display.
      </Box>
    </Box>
  );
}
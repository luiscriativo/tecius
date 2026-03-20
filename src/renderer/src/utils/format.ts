/**
 * Formatting Utilities
 *
 * Collection of pure functions for formatting values in the UI.
 */

/**
 * Formats a date to a human-readable string.
 * @param date - Date object or timestamp in milliseconds
 * @param options - Intl.DateTimeFormat options
 */
export function formatDate(
  date: Date | number,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
): string {
  return new Intl.DateTimeFormat('en-US', options).format(
    typeof date === 'number' ? new Date(date) : date
  )
}

/**
 * Formats a file size in bytes to a human-readable string.
 * @param bytes - File size in bytes
 * @param decimals - Number of decimal places (default: 2)
 */
export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Truncates a string to a maximum length, appending an ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength - 3)}...`
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

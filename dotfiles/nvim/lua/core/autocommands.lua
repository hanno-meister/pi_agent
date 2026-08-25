-- Highlight when yanking (copying) text
vim.api.nvim_create_autocmd('TextYankPost', {
  desc = 'Highlight when yanking (copying) text',
  group = vim.api.nvim_create_augroup('kickstart-highlight-yank', { clear = true }),
  callback = function()
    vim.hl.on_yank()
  end,
})

-- Reload files changed outside of Neovim, e.g. by opencode or other agents.
local external_change_group = vim.api.nvim_create_augroup('external-file-change-detection', { clear = true })

vim.api.nvim_create_autocmd({ 'FocusGained', 'BufEnter', 'CursorHold', 'CursorHoldI', 'TermClose', 'TermLeave' }, {
  desc = 'Check whether open files changed on disk',
  group = external_change_group,
  callback = function()
    if vim.fn.mode() ~= 'c' then
      vim.cmd('checktime')
    end
  end,
})

vim.api.nvim_create_autocmd('FileChangedShellPost', {
  desc = 'Notify when a file was reloaded from disk',
  group = external_change_group,
  callback = function()
    vim.notify('Reloaded file changed on disk', vim.log.levels.INFO)
  end,
})

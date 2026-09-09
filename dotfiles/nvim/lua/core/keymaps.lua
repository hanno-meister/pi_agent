vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Clear highlights on search when pressing <Esc> in normal mode
vim.keymap.set('n', '<Esc>', '<cmd>nohlsearch<CR>')

-- Diagnostic keymaps
vim.keymap.set('n', '<leader>e', function()
  vim.diagnostic.open_float(nil, { focus = false, scope = 'cursor' })
end, { desc = 'Show diagnostic [E]rror popup' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostic [Q]uickfix list' })

-- Disable arrow keys in normal mode
vim.keymap.set('n', '<left>', '<cmd>echo "Use h to move!!"<CR>')
vim.keymap.set('n', '<right>', '<cmd>echo "Use l to move!!"<CR>')
vim.keymap.set('n', '<up>', '<cmd>echo "Use k to move!!"<CR>')
vim.keymap.set('n', '<down>', '<cmd>echo "Use j to move!!"<CR>')

vim.keymap.set('n', '<leader>w', ':bd<CR>', { desc = 'Delete buffer' })

vim.keymap.set('n', '<leader>v', '<cmd>vsplit<CR>', { desc = 'Open current file in right split' })

vim.keymap.set('n', '<leader>r', '<cmd>edit!<CR>', { desc = '[R]eload current file from disk' })

vim.keymap.set('n', '<leader>td', function()
  vim.diagnostic.enable(not vim.diagnostic.is_enabled())
end, { silent = true, noremap = true, desc = '[T]oggle [D]Diagnostics'})

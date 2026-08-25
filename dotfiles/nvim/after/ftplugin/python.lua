vim.opt_local.tabstop = 4
vim.opt_local.shiftwidth = 4
vim.opt_local.softtabstop = 4
vim.opt_local.expandtab = true

vim.g.python_indent = vim.tbl_extend('force', vim.g.python_indent or {}, {
  open_paren = 'shiftwidth()',
  nested_paren = 'shiftwidth()',
  continue = 'shiftwidth()',
  closed_paren_align_last_line = false,
})

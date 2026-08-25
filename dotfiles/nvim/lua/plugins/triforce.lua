return {
  'gisketch/triforce.nvim',
  -- dev = true,
  dependencies = { 'nvzone/volt' },
  config = function()
    require('triforce').setup()

    vim.keymap.set('n', '<leader>tp', require('triforce').show_profile, {
      desc = 'Show Triforce Stats',
    })
  end,
}

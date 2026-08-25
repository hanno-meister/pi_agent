return {
  -- You can easily change to a different colorscheme.
  -- Change the name of the colorscheme plugin below, and then
  -- change the command in the config to whatever the name of that colorscheme is.
  --
  -- If you want to see what colorschemes are already installed, you can use `:Telescope colorscheme`.

  'catppuccin/nvim',
  config = function()
    require('catppuccin').setup {
      flavour = 'mocha'
    }
    vim.cmd.colorscheme 'catppuccin'
  end,
}

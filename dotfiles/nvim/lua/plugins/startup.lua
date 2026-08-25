return {
    'nvimdev/dashboard-nvim',
    dependencies = {
      'nvim-tree/nvim-web-devicons',
      'mahyarmirrashed/famous-quotes.nvim',
    },
    config = function()
      local function quote_footer()
        local footer = { '' }
        local ok, fq = pcall(require, 'famous-quotes')
        if ok then
          local q = fq.get_quote(1)
          if q and q[1] and q[1].quote and q[1].author then
            table.insert(footer, ('“%s”'):format(q[1].quote))
            table.insert(footer, ('— %s'):format(q[1].author))
            table.insert(footer, '')
          end
        end
        return footer
      end

      require('dashboard').setup({
        theme = 'hyper',
        config = {
          week_header = { enable = true },
          project = { enable = false },
          mru = { enable = false },
          shortcut = {
            { desc = '󰊳 Update', group = '@property', action = 'Lazy update', key = 'u' },
            { desc = ' Files', group = 'Label', action = 'Telescope find_files', key = 'f' },
            { desc = '󰊢 Lazygit', group = 'Label', action = 'LazyGit', key = 'g' },
            { desc = '󰙔 Nvim Journey', group = 'DiagnosticHint', action = 'Triforce profile', key = 'j' },
          },
          footer = quote_footer(),
        },
      })
    end,
}

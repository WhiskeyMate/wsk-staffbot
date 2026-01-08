const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ChannelType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
require('dotenv').config();

// Allowed role IDs - users must have at least one of these roles to use the command
const ALLOWED_ROLE_IDS = process.env.ALLOWED_ROLE_IDS?.split(',').map(id => id.trim()) || [];

// Store pending interactions (channel selection before modal)
const pendingAnnouncements = new Map();
const pendingMessages = new Map();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Register slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a message to a channel as the bot (Staff only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the message to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send a rich embed announcement with a form (Staff only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the announcement to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .toJSON()
];

// Check if user has an allowed role
function hasAllowedRole(member) {
    if (ALLOWED_ROLE_IDS.length === 0) {
        console.warn('Warning: No ALLOWED_ROLE_IDS configured. Command will be denied to everyone.');
        return false;
    }
    return member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id));
}

// Parse color string to hex
function parseColor(color) {
    if (!color) return 0x5865F2;

    const colorMap = {
        'red': 0xFF0000,
        'green': 0x00FF00,
        'blue': 0x0000FF,
        'yellow': 0xFFFF00,
        'orange': 0xFFA500,
        'purple': 0x800080,
        'pink': 0xFFC0CB,
        'gold': 0xFFD700,
        'white': 0xFFFFFF,
        'black': 0x000000
    };

    const colorLower = color.toLowerCase().trim();
    if (colorMap[colorLower]) {
        return colorMap[colorLower];
    } else if (color.startsWith('#')) {
        return parseInt(color.slice(1), 16);
    }
    return 0x5865F2;
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'say') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({
                    content: 'You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const channelOption = interaction.options.getChannel('channel');

            // Store the channel for when the modal is submitted
            pendingMessages.set(interaction.user.id, {
                channelId: channelOption.id,
                guildId: interaction.guild.id,
                timestamp: Date.now()
            });

            // Create the modal
            const modal = new ModalBuilder()
                .setCustomId('say_modal')
                .setTitle('Send Message');

            // Message input (paragraph for multi-line)
            const messageInput = new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type your message here... You can use @mentions, #channels, etc.')
                .setRequired(true)
                .setMaxLength(2000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(messageInput)
            );

            await interaction.showModal(modal);
        }

        if (interaction.commandName === 'announce') {
            if (!hasAllowedRole(interaction.member)) {
                return interaction.reply({
                    content: 'You do not have permission to use this command.',
                    ephemeral: true
                });
            }

            const channelOption = interaction.options.getChannel('channel');

            // Store the channel for when the modal is submitted
            pendingAnnouncements.set(interaction.user.id, {
                channelId: channelOption.id,
                guildId: interaction.guild.id,
                timestamp: Date.now()
            });

            // Create the modal
            const modal = new ModalBuilder()
                .setCustomId('announcement_modal')
                .setTitle('Create Announcement');

            // Title input
            const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Announcement title')
                .setRequired(true)
                .setMaxLength(256);

            // Description input (paragraph for multi-line)
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Main announcement content...')
                .setRequired(true)
                .setMaxLength(4000);

            // Color input
            const colorInput = new TextInputBuilder()
                .setCustomId('color')
                .setLabel('Color (optional)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('#FF0000 or red, blue, gold, etc.')
                .setRequired(false)
                .setMaxLength(20);

            // Image URL input
            const imageInput = new TextInputBuilder()
                .setCustomId('image')
                .setLabel('Image URL (optional)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://example.com/image.png')
                .setRequired(false);

            // Footer input
            const footerInput = new TextInputBuilder()
                .setCustomId('footer')
                .setLabel('Footer text (optional)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Footer text')
                .setRequired(false)
                .setMaxLength(2048);

            // Add inputs to action rows (each input needs its own row)
            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(colorInput),
                new ActionRowBuilder().addComponents(imageInput),
                new ActionRowBuilder().addComponents(footerInput)
            );

            await interaction.showModal(modal);
        }
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'say_modal') {
            const pending = pendingMessages.get(interaction.user.id);

            if (!pending) {
                return interaction.reply({
                    content: 'Session expired. Please use /say again.',
                    ephemeral: true
                });
            }

            // Clean up
            pendingMessages.delete(interaction.user.id);

            const message = interaction.fields.getTextInputValue('message');

            try {
                const channel = await client.channels.fetch(pending.channelId);

                if (!channel || !channel.isTextBased()) {
                    return interaction.reply({
                        content: 'Target channel is no longer valid.',
                        ephemeral: true
                    });
                }

                await channel.send(message);
                await interaction.reply({
                    content: `Message sent to <#${pending.channelId}>`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error sending message:', error.message);
                await interaction.reply({
                    content: `Failed to send message: ${error.message}`,
                    ephemeral: true
                });
            }
        }

        if (interaction.customId === 'announcement_modal') {
            const pending = pendingAnnouncements.get(interaction.user.id);

            if (!pending) {
                return interaction.reply({
                    content: 'Session expired. Please use /announce again.',
                    ephemeral: true
                });
            }

            // Clean up
            pendingAnnouncements.delete(interaction.user.id);

            const title = interaction.fields.getTextInputValue('title');
            const description = interaction.fields.getTextInputValue('description');
            const color = interaction.fields.getTextInputValue('color');
            const image = interaction.fields.getTextInputValue('image');
            const footer = interaction.fields.getTextInputValue('footer');

            try {
                const channel = await client.channels.fetch(pending.channelId);

                if (!channel || !channel.isTextBased()) {
                    return interaction.reply({
                        content: 'Target channel is no longer valid.',
                        ephemeral: true
                    });
                }

                // Build the embed
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(parseColor(color))
                    .setTimestamp();

                if (image && image.trim()) {
                    embed.setImage(image.trim());
                }
                if (footer && footer.trim()) {
                    embed.setFooter({ text: footer.trim() });
                }

                await channel.send({ embeds: [embed] });
                await interaction.reply({
                    content: `Announcement sent to <#${pending.channelId}>`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error sending announcement:', error.message);
                await interaction.reply({
                    content: `Failed to send announcement: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
});

// Clean up old pending data every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of pendingAnnouncements) {
        if (now - data.timestamp > 300000) { // 5 minutes
            pendingAnnouncements.delete(userId);
        }
    }
    for (const [userId, data] of pendingMessages) {
        if (now - data.timestamp > 300000) { // 5 minutes
            pendingMessages.delete(userId);
        }
    }
}, 300000);

client.login(process.env.DISCORD_TOKEN);
